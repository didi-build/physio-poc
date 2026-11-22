import type { AppDependencies } from "../../http/app.js";
import { ExerciseMediaService } from "../exercise-media/exercise-media-service.js";
import { PrefixMediaStorage } from "../../storage/adapters/memory/prefix-media-storage.js";
import { FakeImageGeneration } from "../../storage/adapters/memory/fake-image-generation.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
} from "../../storage/repositories/exercise-data.js";
import { ExerciseVersionMediaRepository } from "../../storage/repositories/exercise-media.js";
import type {
  DraftGenerationWorkflowPort,
  ExerciseRequestDraftGenerationWorkflowParams,
} from "./draft-generation-workflow-types.js";
import { runExerciseRequestDraftGeneration } from "./run-exercise-request-draft-generation.js";
import type { DraftGenerationStepName } from "./draft-generation-lock-log.js";
import type { ExerciseRequestDraftView } from "./types.js";
import { fakeExerciseDraftGenerator } from "./fake-draft-generator.js";
import type { ExerciseDraftGenerator } from "./exercise-draft-generator-types.js";

export type InProcessDraftGenerationWorkflowOptions = {
  stopAfterStep?: DraftGenerationStepName;
};

type InProcessContext = {
  deps: AppDependencies;
  loadView: (requestId: string) => Promise<ExerciseRequestDraftView>;
  draftGenerator: ExerciseDraftGenerator;
};

/**
 * Local/test runner: one in-flight workflow per request id (mirrors Cloudflare instance id).
 */
export function createInProcessDraftGenerationWorkflowPort(
  getContext: () => InProcessContext,
  options: InProcessDraftGenerationWorkflowOptions = {},
): DraftGenerationWorkflowPort & {
  drain: (requestId?: string) => Promise<void>;
  inflightRequestIds: () => string[];
} {
  const inflight = new Map<string, Promise<void>>();
  const started = new Set<string>();

  return {
    inflightRequestIds: () => [...started],
    async drain(requestId?: string) {
      const targets = requestId
        ? [inflight.get(requestId)].filter(Boolean)
        : [...inflight.values()];
      await Promise.all(targets);
    },
    async start(input: ExerciseRequestDraftGenerationWorkflowParams) {
      if (started.has(input.requestId) || inflight.has(input.requestId)) {
        return "already_running";
      }
      started.add(input.requestId);
      const { deps, loadView, draftGenerator } = getContext();
      const requests = new ExerciseRequestsRepository(deps.sql);
      const exercises = new ExercisesRepository(deps.sql);
      const versions = new ExerciseVersionsRepository(deps.sql);
      const versionMedia = new ExerciseVersionMediaRepository(deps.sql);
      const mediaService = new ExerciseMediaService(
        deps.sql,
        deps.exerciseMediaImages ?? new FakeImageGeneration(),
        new PrefixMediaStorage(deps.objects),
      );
      const runPromise = runExerciseRequestDraftGeneration({
        practitionerId: input.practitionerId,
        requestId: input.requestId,
        mediaService,
        loadView,
        deps: {
          sql: deps.sql,
          draftGenerator,
          now: () => new Date().toISOString(),
          requests,
          exercises,
          versions,
          versionMedia,
        },
        stopAfterStep: options.stopAfterStep,
      })
        .then(() => undefined)
        .catch((error) => {
          console.error(
            JSON.stringify({
              event: "physio_draft_generation_in_process_failed",
              request_id: input.requestId,
              error_name: error instanceof Error ? error.name : "Error",
            }),
          );
        })
        .finally(() => {
          inflight.delete(input.requestId);
          started.delete(input.requestId);
        });
      inflight.set(input.requestId, runPromise);
      return "started";
    },
  };
}

export function defaultDraftGenerationWorkflowPort(
  context: InProcessContext,
): DraftGenerationWorkflowPort {
  return createInProcessDraftGenerationWorkflowPort(() => context);
}

export function draftGeneratorFromDeps(deps: AppDependencies): ExerciseDraftGenerator {
  return deps.exerciseDraftGenerator ?? fakeExerciseDraftGenerator;
}
