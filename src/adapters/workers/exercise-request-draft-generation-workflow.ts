import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";

class NonRetryableError extends Error {
  override readonly name = "NonRetryableError";
}
import type { WorkerEnv } from "./create-app-dependencies.js";
import type { ExerciseRequestDraftGenerationWorkflowParams } from "../../services/exercise-requests/draft-generation-workflow-types.js";
import type { PhysioExerciseRequestDraftGenerationBinding } from "./cloudflare-workflow-binding.js";
import { createWorkerProductionAppDependencies } from "./create-worker-production-app-dependencies.js";
import { runExerciseRequestDraftGeneration } from "../../services/exercise-requests/run-exercise-request-draft-generation.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
} from "../../storage/repositories/exercise-data.js";
import { ExerciseVersionMediaRepository } from "../../storage/repositories/exercise-media.js";
import { ExerciseMediaService } from "../../services/exercise-media/exercise-media-service.js";
import { ExerciseRequestsService } from "../../services/exercise-requests/exercise-requests-service.js";
import { PrefixMediaStorage } from "../../storage/adapters/memory/prefix-media-storage.js";
import { ExerciseRequestsServiceError } from "../../services/exercise-requests/errors.js";
import type { DraftGenerationStepName } from "../../services/exercise-requests/draft-generation-lock-log.js";

export type ExerciseRequestDraftGenerationWorkflowEnv = WorkerEnv & {
  PHYSIO_EXERCISE_REQUEST_DRAFT_GENERATION?: PhysioExerciseRequestDraftGenerationBinding;
};

const STEP_RETRY = {
  retries: { limit: 3, delay: "1 second", backoff: "exponential" },
} as const;

export class ExerciseRequestDraftGenerationWorkflow extends WorkflowEntrypoint<
  ExerciseRequestDraftGenerationWorkflowEnv,
  ExerciseRequestDraftGenerationWorkflowParams
> {
  async run(
    event: WorkflowEvent<ExerciseRequestDraftGenerationWorkflowParams>,
    step: WorkflowStep,
  ): Promise<void> {
    const { requestId, practitionerId, attemptId } = event.payload;
    const deps = createWorkerProductionAppDependencies(this.env);
    await step.do("text", STEP_RETRY, () =>
      this.runChunk(requestId, practitionerId, attemptId, deps, "text"),
    );
    await step.do("start_image", STEP_RETRY, () =>
      this.runChunk(requestId, practitionerId, attemptId, deps, "start_image"),
    );
    await step.do("end_image", STEP_RETRY, () =>
      this.runChunk(requestId, practitionerId, attemptId, deps, "end_image"),
    );
    await step.do("finalize", STEP_RETRY, () =>
      this.runChunk(requestId, practitionerId, attemptId, deps, "finalize"),
    );
  }

  private async runChunk(
    requestId: string,
    practitionerId: string,
    attemptId: string,
    deps: ReturnType<typeof createWorkerProductionAppDependencies>,
    stopAfterStep: DraftGenerationStepName,
  ): Promise<void> {
    if (!deps.exerciseDraftGenerator || !deps.exerciseMediaImages) {
      throw new NonRetryableError("Draft generation dependencies are not configured");
    }
    const requests = new ExerciseRequestsRepository(deps.sql);
    const exercises = new ExercisesRepository(deps.sql);
    const versions = new ExerciseVersionsRepository(deps.sql);
    const versionMedia = new ExerciseVersionMediaRepository(deps.sql);
    const mediaService = new ExerciseMediaService(
      deps.sql,
      deps.exerciseMediaImages,
      new PrefixMediaStorage(deps.objects),
    );
    const requestService = new ExerciseRequestsService(deps.sql, deps.config, {
      draftGenerator: deps.exerciseDraftGenerator,
    });
    try {
      await runExerciseRequestDraftGeneration({
        practitionerId,
        requestId,
        attemptId,
        mediaService,
        loadView: (id) => requestService.loadDraftView(id),
        deps: {
          sql: deps.sql,
          draftGenerator: deps.exerciseDraftGenerator,
          now: () => new Date().toISOString(),
          requests,
          exercises,
          versions,
          versionMedia,
        },
        stopAfterStep: stopAfterStep === "finalize" ? undefined : stopAfterStep,
        releaseLockOnFinish: stopAfterStep === "finalize",
      });
    } catch (error) {
      if (error instanceof ExerciseRequestsServiceError) {
        if (
          error.code === "generation_not_requester" ||
          error.code === "request_not_found"
        ) {
          throw new NonRetryableError(error.message);
        }
      }
      throw error;
    }
  }
}
