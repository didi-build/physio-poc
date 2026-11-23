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
import {
  persistDraftGenerationTerminalFailure,
  runExerciseRequestDraftGeneration,
} from "./run-exercise-request-draft-generation.js";
import { DraftGenerationTerminalFailure } from "./draft-generation-terminal-failure.js";
import { throwDraftGenerationFailure } from "./draft-generation-error-mapping.js";
import type { DraftGenerationStepName } from "./draft-generation-lock-log.js";
import type { ExerciseRequestDraftView } from "./types.js";
import { fakeExerciseDraftGenerator } from "./fake-draft-generator.js";
import type { ExerciseDraftGenerator } from "./exercise-draft-generator-types.js";
import { WORKFLOW_INSTANCE_ALREADY_EXISTS_ID } from "./workflow-instance-already-exists.js";

export type InProcessDraftGenerationWorkflowOptions = {
  stopAfterStep?: DraftGenerationStepName;
};

type InProcessContext = {
  deps: AppDependencies;
  loadView: (requestId: string) => Promise<ExerciseRequestDraftView>;
  draftGenerator: ExerciseDraftGenerator;
  mediaService?: ExerciseMediaService;
};

/**
 * Local/test runner: retains finished workflow instance ids like Cloudflare.
 */
export function createInProcessDraftGenerationWorkflowPort(
  getContext: () => InProcessContext,
  options: InProcessDraftGenerationWorkflowOptions = {},
): DraftGenerationWorkflowPort & {
  drain: (requestId?: string) => Promise<void>;
  inflightInstanceIds: () => string[];
  retainedInstanceIds: () => string[];
} {
  const inflight = new Map<string, Promise<void>>();
  const retainedInstanceIds = new Set<string>();

  return {
    inflightInstanceIds: () => [...inflight.keys()],
    retainedInstanceIds: () => [...retainedInstanceIds],
    async drain(requestId?: string) {
      const targets = requestId
        ? [...inflight.entries()]
            .filter(([key]) => key.startsWith(`${requestId}:`))
            .map(([, promise]) => promise)
        : [...inflight.values()];
      await Promise.all(targets);
    },
    async start(input: ExerciseRequestDraftGenerationWorkflowParams) {
      const instanceId = `${input.requestId}:${input.attemptId}`;
      if (retainedInstanceIds.has(instanceId) || inflight.has(instanceId)) {
        throw new Error(
          `${WORKFLOW_INSTANCE_ALREADY_EXISTS_ID} An instance with this ID already exists`,
        );
      }
      const {
        deps,
        loadView,
        draftGenerator,
        mediaService: boundMediaService,
      } = getContext();
      const requests = new ExerciseRequestsRepository(deps.sql);
      const exercises = new ExercisesRepository(deps.sql);
      const versions = new ExerciseVersionsRepository(deps.sql);
      const versionMedia = new ExerciseVersionMediaRepository(deps.sql);
      const mediaService =
        boundMediaService ??
        new ExerciseMediaService(
          deps.sql,
          deps.exerciseMediaImages ?? new FakeImageGeneration(),
          new PrefixMediaStorage(deps.objects),
        );
      const runPromise = runExerciseRequestDraftGeneration({
        practitionerId: input.practitionerId,
        requestId: input.requestId,
        attemptId: input.attemptId,
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
        .catch(async (error) => {
          const persistTerminal = async (
            terminal: DraftGenerationTerminalFailure,
          ): Promise<void> => {
            await persistDraftGenerationTerminalFailure({
              requests,
              requestId: input.requestId,
              attemptId: input.attemptId,
              terminal: terminal.terminal,
            });
          };
          if (error instanceof DraftGenerationTerminalFailure) {
            await persistTerminal(error);
          } else {
            const row = await requests.findById(input.requestId);
            const phase = row?.exercise_id ? "images" : "text";
            try {
              await throwDraftGenerationFailure(error, phase, input.requestId, () =>
                loadView(input.requestId),
              );
            } catch (terminal) {
              if (terminal instanceof DraftGenerationTerminalFailure) {
                await persistTerminal(terminal);
              }
            }
          }
          console.error(
            JSON.stringify({
              event: "physio_draft_generation_in_process_failed",
              request_id: input.requestId,
              attempt_id: input.attemptId,
              error_name: error instanceof Error ? error.name : "Error",
            }),
          );
        })
        .finally(() => {
          inflight.delete(instanceId);
          retainedInstanceIds.add(instanceId);
        });
      inflight.set(instanceId, runPromise);
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
