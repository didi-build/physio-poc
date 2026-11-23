import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";

/** Matches Cloudflare Workflows non-retryable step errors (name is what the runtime checks). */
class NonRetryableError extends Error {
  override readonly name = "NonRetryableError";
}

function isNonRetryableError(error: unknown): error is NonRetryableError {
  return (
    error instanceof NonRetryableError ||
    (error instanceof Error && error.name === "NonRetryableError")
  );
}
import type { WorkerEnv } from "./create-app-dependencies.js";
import type { ExerciseRequestDraftGenerationWorkflowParams } from "../../services/exercise-requests/draft-generation-workflow-types.js";
import type { PhysioExerciseRequestDraftGenerationBinding } from "./cloudflare-workflow-binding.js";
import { createWorkerProductionAppDependencies } from "./create-worker-production-app-dependencies.js";
import {
  persistDraftGenerationTerminalFailure,
  runExerciseRequestDraftGeneration,
} from "../../services/exercise-requests/run-exercise-request-draft-generation.js";
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
import { logDraftGenerationLockReleased } from "../../services/exercise-requests/draft-generation-lock-log.js";
import { DraftGenerationTerminalFailure } from "../../services/exercise-requests/draft-generation-terminal-failure.js";
import { throwDraftGenerationFailure } from "../../services/exercise-requests/draft-generation-error-mapping.js";

export type ExerciseRequestDraftGenerationWorkflowEnv = WorkerEnv & {
  PHYSIO_EXERCISE_REQUEST_DRAFT_GENERATION?: PhysioExerciseRequestDraftGenerationBinding;
};

/** Cloudflare Workflows: `limit` retries after the first attempt (3 attempts when limit is 2). */
export const DRAFT_GENERATION_WORKFLOW_STEP_RETRY = {
  retries: { limit: 2, delay: "1 second", backoff: "exponential" },
} as const;

const STEP_RETRY = DRAFT_GENERATION_WORKFLOW_STEP_RETRY;

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
    const stepContext = { requestId, practitionerId, attemptId, deps };
    await this.runStep(step, "text", stepContext, () =>
      this.runChunk(requestId, practitionerId, attemptId, deps, "text"),
    );
    await this.runStep(step, "start_image", stepContext, () =>
      this.runChunk(requestId, practitionerId, attemptId, deps, "start_image"),
    );
    await this.runStep(step, "end_image", stepContext, () =>
      this.runChunk(requestId, practitionerId, attemptId, deps, "end_image"),
    );
    await this.runStep(step, "finalize", stepContext, () =>
      this.runChunk(requestId, practitionerId, attemptId, deps, "finalize"),
    );
  }

  private async runStep(
    step: WorkflowStep,
    stepName: DraftGenerationStepName,
    context: {
      requestId: string;
      practitionerId: string;
      attemptId: string;
      deps: ReturnType<typeof createWorkerProductionAppDependencies>;
    },
    runner: () => Promise<void>,
  ): Promise<void> {
    try {
      await step.do(stepName, STEP_RETRY, runner);
    } catch (error) {
      if (isNonRetryableError(error)) {
        throw error;
      }
      await this.finalizeExhaustedStepFailure(context, stepName, error);
      throw error;
    }
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
        deferTerminalPersistence: true,
      });
    } catch (error) {
      if (error instanceof ExerciseRequestsServiceError) {
        if (
          error.code === "generation_not_requester" ||
          error.code === "request_not_found" ||
          error.code === "draft_generation_in_progress"
        ) {
          throw new NonRetryableError(error.message);
        }
      }
      if (error instanceof DraftGenerationTerminalFailure) {
        await this.finalizeTerminalFailure({
          requests,
          requestId,
          attemptId,
          terminal: error.terminal,
          now: () => new Date().toISOString(),
        });
        throw new NonRetryableError(error.message);
      }
      throw error;
    }
  }

  private async finalizeExhaustedStepFailure(
    context: {
      requestId: string;
      practitionerId: string;
      attemptId: string;
      deps: ReturnType<typeof createWorkerProductionAppDependencies>;
    },
    stepName: DraftGenerationStepName,
    error: unknown,
  ): Promise<void> {
    const requests = new ExerciseRequestsRepository(context.deps.sql);
    const requestService = new ExerciseRequestsService(
      context.deps.sql,
      context.deps.config,
      { draftGenerator: context.deps.exerciseDraftGenerator! },
    );
    const loadView = () => requestService.loadDraftView(context.requestId);
    const phase: "text" | "images" =
      stepName === "text" || stepName === "finalize" ? "text" : "images";
    try {
      await throwDraftGenerationFailure(error, phase, context.requestId, loadView);
    } catch (terminal) {
      if (terminal instanceof DraftGenerationTerminalFailure) {
        await this.finalizeTerminalFailure({
          requests,
          requestId: context.requestId,
          attemptId: context.attemptId,
          terminal: terminal.terminal,
          now: () => new Date().toISOString(),
        });
      }
    }
  }

  private async finalizeTerminalFailure(input: {
    requests: ExerciseRequestsRepository;
    requestId: string;
    attemptId: string;
    terminal: DraftGenerationTerminalFailure["terminal"];
    now: () => string;
  }): Promise<void> {
    await persistDraftGenerationTerminalFailure({
      requests: input.requests,
      requestId: input.requestId,
      attemptId: input.attemptId,
      terminal: input.terminal,
    });
    const held = await input.requests.getDraftGenerationLockedAt(input.requestId);
    const released = await input.requests.releaseDraftGenerationLock(
      input.requestId,
      input.attemptId,
    );
    if (released) {
      logDraftGenerationLockReleased({
        requestId: input.requestId,
        lockedAt: held,
        now: input.now(),
      });
    }
  }
}
