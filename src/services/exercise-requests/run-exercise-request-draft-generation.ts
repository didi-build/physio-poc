import { DeepInfraExerciseDraftError } from "./deepinfra-exercise-draft-error.js";
import type { ExerciseDraftGenerator } from "./exercise-draft-generator-types.js";
import { ExerciseRequestsServiceError } from "./errors.js";
import type {
  ExerciseRequestDraftView,
  GenerateExerciseRequestDraftResult,
} from "./types.js";
import type { ExerciseMediaService } from "../exercise-media/exercise-media-service.js";
import { ExerciseMediaServiceError } from "../exercise-media/exercise-media-service.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
} from "../../storage/repositories/exercise-data.js";
import { ExerciseVersionMediaRepository } from "../../storage/repositories/exercise-media.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { ImageGenerationError } from "../../storage/ports/image-generation.js";
import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import { mapDraftGenerationFailureToResult } from "./draft-generation-error-mapping.js";
import {
  logDraftGenerationLockRefreshed,
  logDraftGenerationLockReleased,
  logDraftGenerationRunAbandoned,
  logDraftGenerationStepEnded,
  logDraftGenerationStepStarted,
  type DraftGenerationStepName,
} from "./draft-generation-lock-log.js";

export type DraftGenerationRunDeps = {
  sql: SqlStoragePort;
  draftGenerator: ExerciseDraftGenerator;
  now: () => string;
  requests: ExerciseRequestsRepository;
  exercises: ExercisesRepository;
  versions: ExerciseVersionsRepository;
  versionMedia: ExerciseVersionMediaRepository;
};

function draftVersionNeedsTextRedraft(draft: {
  description: string;
  starting_position: string;
  steps: string;
}): boolean {
  return (
    draft.description.trim().length === 0 ||
    draft.starting_position.trim().length === 0 ||
    draft.steps.trim().length === 0
  );
}

async function refreshGenerationLock(input: {
  requestId: string;
  requests: ExerciseRequestsRepository;
  now: string;
}): Promise<string> {
  const lockedAt = input.now;
  await input.requests.refreshDraftGenerationLock({
    requestId: input.requestId,
    lockedAt,
  });
  const previous = await input.requests.getDraftGenerationLockedAt(input.requestId);
  logDraftGenerationLockRefreshed({
    requestId: input.requestId,
    lockedAt: previous ?? lockedAt,
    now: input.now,
  });
  return lockedAt;
}

async function runTimedStep<T>(
  requestId: string,
  step: DraftGenerationStepName,
  fn: () => Promise<T>,
): Promise<T> {
  logDraftGenerationStepStarted({ requestId, step });
  const started = Date.now();
  try {
    const result = await fn();
    logDraftGenerationStepEnded({
      requestId,
      step,
      durationMs: Date.now() - started,
      outcome: "ok",
    });
    return result;
  } catch (error) {
    logDraftGenerationStepEnded({
      requestId,
      step,
      durationMs: Date.now() - started,
      outcome: "failed",
    });
    throw error;
  }
}

export type DraftGenerationWorkflowRunInput = {
  practitionerId: string;
  requestId: string;
  mediaService: ExerciseMediaService;
  loadView: (requestId: string) => Promise<ExerciseRequestDraftView>;
  deps: DraftGenerationRunDeps;
  /** When set, stop after this step (tests / workflow chunks). */
  stopAfterStep?: DraftGenerationStepName;
  /** When false, the lock stays held for a later chunk (Workflow steps). */
  releaseLockOnFinish?: boolean;
};

/**
 * Step-oriented draft generation body. Reused by the Cloudflare Workflow and the
 * in-process test runner (DIDI-1280 empty-text auto-generate rides the same entry).
 */
export async function runExerciseRequestDraftGeneration(
  input: DraftGenerationWorkflowRunInput,
): Promise<GenerateExerciseRequestDraftResult> {
  const requestId = validateOpaqueEntityId(input.requestId, "request_id");
  const row = await input.deps.requests.findById(requestId);
  if (!row || !["open", "drafting"].includes(row.status)) {
    throw new ExerciseRequestsServiceError("Request not found", "request_not_found");
  }
  if (row.requested_by !== input.practitionerId) {
    throw new ExerciseRequestsServiceError(
      "Only the requester can run draft generation",
      "generation_not_requester",
    );
  }

  const loadView = () => input.loadView(requestId);
  try {
    let exerciseId = row.exercise_id;
    let versionId: string | null = null;
    const now = input.deps.now();

    if (!exerciseId) {
      const textResult = await runTimedStep(requestId, "text", async () => {
        try {
          const generated = await input.deps.draftGenerator(
            {
              sql: input.deps.sql,
              requestId,
              requestedName: row.requested_name,
              exerciseNote: row.note,
              requestedBy: row.requested_by,
              now,
            },
            {
              exercises: input.deps.exercises,
              versions: input.deps.versions,
              requests: input.deps.requests,
            },
          );
          return generated;
        } catch (error) {
          if (error instanceof DeepInfraExerciseDraftError) {
            return {
              outcome: "text_failed" as const,
              error: error.code,
              view: null,
            };
          }
          if (error instanceof ExerciseRequestsServiceError) {
            throw error;
          }
          return mapDraftGenerationFailureToResult(error, "text", requestId, loadView);
        }
      });
      if ("outcome" in textResult) {
        return textResult;
      }
      exerciseId = textResult.exerciseId;
      versionId = textResult.versionId;
    } else {
      const draft = await input.deps.versions.findDraftForExercise(exerciseId);
      versionId = draft?.id ?? null;
      const textRow = draft
        ? await input.deps.sql.first<{
            description: string;
            starting_position: string;
            steps: string;
          }>(
            `SELECT description, starting_position, steps
             FROM exercise_versions WHERE id = ? LIMIT 1`,
            [draft.id],
          )
        : null;
      if (draft && textRow && draftVersionNeedsTextRedraft(textRow)) {
        const fillResult = await runTimedStep(requestId, "text", async () => {
          try {
            await input.deps.draftGenerator(
              {
                sql: input.deps.sql,
                requestId,
                requestedName: row.requested_name,
                exerciseNote: row.note,
                requestedBy: row.requested_by,
                now,
                existingExerciseId: exerciseId!,
                existingVersionId: draft.id,
              },
              {
                exercises: input.deps.exercises,
                versions: input.deps.versions,
                requests: input.deps.requests,
              },
            );
            return null;
          } catch (error) {
            if (error instanceof DeepInfraExerciseDraftError) {
              return {
                outcome: "text_failed" as const,
                error: error.code,
                view: null,
              };
            }
            return mapDraftGenerationFailureToResult(
              error,
              "text",
              requestId,
              loadView,
            );
          }
        });
        if (fillResult) {
          return fillResult;
        }
      }
    }

    if (input.stopAfterStep === "text") {
      logDraftGenerationRunAbandoned({ requestId, step: "text" });
      return {
        outcome: "in_progress",
        view: await loadView(),
        started_elsewhere: false,
      };
    }

    await refreshGenerationLock({
      requestId,
      requests: input.deps.requests,
      now: input.deps.now(),
    });

    if (!exerciseId || !versionId) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }

    const progress = await input.mediaService.getInitialDraftMediaProgress(versionId);
    if (progress === "none") {
      try {
        await runTimedStep(requestId, "start_image", () =>
          input.mediaService.generateInitialStartImageForVersion({
            practitionerId: input.practitionerId,
            exerciseVersionId: versionId!,
          }),
        );
      } catch (error) {
        if (error instanceof ExerciseMediaServiceError) {
          if (error.code === "daily_limit_reached") {
            const view = await loadView();
            return { outcome: "daily_limit", view };
          }
          if (error.code === "exercise_media_already_generated") {
            // complete
          } else {
            const view = await loadView();
            return { outcome: "images_failed", view };
          }
        } else if (error instanceof ImageGenerationError) {
          const view = await loadView();
          return { outcome: "images_failed", view };
        } else {
          return mapDraftGenerationFailureToResult(
            error,
            "images",
            requestId,
            loadView,
          );
        }
      }
    }

    if (input.stopAfterStep === "start_image") {
      logDraftGenerationRunAbandoned({ requestId, step: "start_image" });
      return {
        outcome: "in_progress",
        view: await loadView(),
        started_elsewhere: false,
      };
    }

    await refreshGenerationLock({
      requestId,
      requests: input.deps.requests,
      now: input.deps.now(),
    });

    const afterStart = await input.mediaService.getInitialDraftMediaProgress(versionId);
    if (afterStart !== "complete") {
      try {
        await runTimedStep(requestId, "end_image", () =>
          input.mediaService.generateInitialEndImageForVersion({
            practitionerId: input.practitionerId,
            exerciseVersionId: versionId!,
            countTowardDailyQuota: false,
          }),
        );
      } catch (error) {
        if (error instanceof ExerciseMediaServiceError) {
          if (error.code === "daily_limit_reached") {
            const view = await loadView();
            return { outcome: "daily_limit", view };
          }
          if (error.code === "exercise_media_already_generated") {
            // idempotent
          } else {
            const view = await loadView();
            return { outcome: "images_failed", view };
          }
        } else if (error instanceof ImageGenerationError) {
          const view = await loadView();
          return { outcome: "images_failed", view };
        } else {
          return mapDraftGenerationFailureToResult(
            error,
            "images",
            requestId,
            loadView,
          );
        }
      }
    }

    if (input.stopAfterStep === "end_image") {
      logDraftGenerationRunAbandoned({ requestId, step: "end_image" });
      return {
        outcome: "in_progress",
        view: await loadView(),
        started_elsewhere: false,
      };
    }

    await refreshGenerationLock({
      requestId,
      requests: input.deps.requests,
      now: input.deps.now(),
    });

    const view = await runTimedStep(requestId, "finalize", loadView);
    return { outcome: "complete", view };
  } catch (error) {
    if (error instanceof ExerciseRequestsServiceError) {
      throw error;
    }
    return mapDraftGenerationFailureToResult(error, "persist", requestId, loadView);
  } finally {
    if (input.releaseLockOnFinish !== false) {
      const now = input.deps.now();
      const held = await input.deps.requests.getDraftGenerationLockedAt(requestId);
      await input.deps.requests.releaseDraftGenerationLockByRequestId(requestId);
      logDraftGenerationLockReleased({ requestId, lockedAt: held, now });
    }
  }
}
