import { DeepInfraExerciseDraftError } from "./deepinfra-exercise-draft-error.js";
import {
  isRetryableDeepInfraExerciseDraftError,
  isRetryableImageGenerationError,
} from "./draft-generation-provider-retry.js";
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
import { throwDraftGenerationFailure } from "./draft-generation-error-mapping.js";
import {
  logDraftGenerationLockRefreshed,
  logDraftGenerationLockReleased,
  logDraftGenerationStepEnded,
  logDraftGenerationStepStarted,
  type DraftGenerationStepName,
} from "./draft-generation-lock-log.js";
import { DraftGenerationTerminalFailure } from "./draft-generation-terminal-failure.js";
import { terminalOutcomeToFailureCode } from "./draft-generation-failure-codes.js";

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
  ending_position: string;
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
  attemptId: string;
  requests: ExerciseRequestsRepository;
  now: string;
}): Promise<void> {
  const lockedBefore = await input.requests.getDraftGenerationLockedAt(input.requestId);
  const ok = await input.requests.refreshDraftGenerationLock({
    requestId: input.requestId,
    lockedAt: input.now,
    attemptId: input.attemptId,
  });
  if (!ok) {
    throw new ExerciseRequestsServiceError(
      "Draft generation lock was superseded",
      "draft_generation_in_progress",
    );
  }
  logDraftGenerationLockRefreshed({
    requestId: input.requestId,
    lockedAt: lockedBefore ?? input.now,
    now: input.now,
  });
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

export async function persistDraftGenerationTerminalFailure(input: {
  requests: ExerciseRequestsRepository;
  requestId: string;
  attemptId: string;
  terminal: DraftGenerationTerminalFailure["terminal"];
}): Promise<void> {
  const code = terminalOutcomeToFailureCode(
    input.terminal.outcome,
    "error" in input.terminal ? input.terminal.error : undefined,
  );
  await input.requests.setDraftGenerationFailure({
    requestId: input.requestId,
    attemptId: input.attemptId,
    failureCode: code,
  });
}

export type DraftGenerationWorkflowRunInput = {
  practitionerId: string;
  requestId: string;
  attemptId?: string;
  mediaService: ExerciseMediaService;
  loadView: (requestId: string) => Promise<ExerciseRequestDraftView>;
  deps: DraftGenerationRunDeps;
  /** When set, stop after this step (tests / workflow chunks). */
  stopAfterStep?: DraftGenerationStepName;
  /** When false, the lock stays held for a later chunk (Workflow steps). */
  releaseLockOnFinish?: boolean;
  /** When true, terminal failures throw without persisting (Workflow finalizes). */
  deferTerminalPersistence?: boolean;
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

  const attemptId =
    input.attemptId ??
    row.draft_generation_attempt_id ??
    (await input.deps.requests.getDraftGenerationAttemptId(requestId));
  if (!attemptId) {
    throw new ExerciseRequestsServiceError(
      "Draft generation lock missing attempt",
      "draft_not_ready",
    );
  }

  const loadView = () => input.loadView(requestId);
  try {
    let exerciseId = row.exercise_id;
    let versionId: string | null = null;
    const now = input.deps.now();

    if (!exerciseId) {
      const textResult = (await runTimedStep(requestId, "text", async () => {
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
            if (
              input.deferTerminalPersistence === true &&
              isRetryableDeepInfraExerciseDraftError(error)
            ) {
              throw error;
            }
            throw new DraftGenerationTerminalFailure({
              outcome: "text_failed",
              error: error.code,
              view: null,
            });
          }
          if (error instanceof ExerciseRequestsServiceError) {
            throw error;
          }
          throw error;
        }
      })) as { exerciseId: string; versionId: string };
      exerciseId = textResult.exerciseId;
      versionId = textResult.versionId;
    } else {
      const draft = await input.deps.versions.findDraftForExercise(exerciseId);
      versionId = draft?.id ?? null;
      const textRow = draft
        ? await input.deps.sql.first<{
            description: string;
            starting_position: string;
            ending_position: string;
            steps: string;
          }>(
            `SELECT description, starting_position, ending_position, steps
             FROM exercise_versions WHERE id = ? LIMIT 1`,
            [draft.id],
          )
        : null;
      if (draft && textRow && draftVersionNeedsTextRedraft(textRow)) {
        await runTimedStep(requestId, "text", async () => {
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
          } catch (error) {
            if (error instanceof DeepInfraExerciseDraftError) {
              if (
                input.deferTerminalPersistence === true &&
                isRetryableDeepInfraExerciseDraftError(error)
              ) {
                throw error;
              }
              throw new DraftGenerationTerminalFailure({
                outcome: "text_failed",
                error: error.code,
                view: null,
              });
            }
            throw error;
          }
        });
      }
    }

    if (input.stopAfterStep === "text") {
      return {
        outcome: "in_progress",
        view: await loadView(),
        started_elsewhere: false,
      };
    }

    await refreshGenerationLock({
      requestId,
      attemptId,
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
            throw new DraftGenerationTerminalFailure({
              outcome: "daily_limit",
              view: await loadView(),
            });
          }
          if (error.code !== "exercise_media_already_generated") {
            throw new DraftGenerationTerminalFailure({
              outcome: "images_failed",
              view: await loadView(),
            });
          }
        } else if (error instanceof ImageGenerationError) {
          if (
            input.deferTerminalPersistence === true &&
            isRetryableImageGenerationError(error)
          ) {
            throw error;
          }
          throw new DraftGenerationTerminalFailure({
            outcome: "images_failed",
            view: await loadView(),
          });
        } else {
          throw error;
        }
      }
    }

    if (input.stopAfterStep === "start_image") {
      return {
        outcome: "in_progress",
        view: await loadView(),
        started_elsewhere: false,
      };
    }

    await refreshGenerationLock({
      requestId,
      attemptId,
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
            throw new DraftGenerationTerminalFailure({
              outcome: "daily_limit",
              view: await loadView(),
            });
          }
          if (error.code !== "exercise_media_already_generated") {
            throw new DraftGenerationTerminalFailure({
              outcome: "images_failed",
              view: await loadView(),
            });
          }
        } else if (error instanceof ImageGenerationError) {
          if (
            input.deferTerminalPersistence === true &&
            isRetryableImageGenerationError(error)
          ) {
            throw error;
          }
          throw new DraftGenerationTerminalFailure({
            outcome: "images_failed",
            view: await loadView(),
          });
        } else {
          throw error;
        }
      }
    }

    if (input.stopAfterStep === "end_image") {
      return {
        outcome: "in_progress",
        view: await loadView(),
        started_elsewhere: false,
      };
    }

    await refreshGenerationLock({
      requestId,
      attemptId,
      requests: input.deps.requests,
      now: input.deps.now(),
    });

    const view = await runTimedStep(requestId, "finalize", loadView);
    await input.deps.requests.clearDraftGenerationFailureOnSuccess(
      requestId,
      attemptId,
    );
    return { outcome: "complete", view };
  } catch (error) {
    if (error instanceof DraftGenerationTerminalFailure) {
      if (input.deferTerminalPersistence !== true) {
        await persistDraftGenerationTerminalFailure({
          requests: input.deps.requests,
          requestId,
          attemptId,
          terminal: error.terminal,
        });
      }
      throw error;
    }
    if (error instanceof ExerciseRequestsServiceError) {
      throw error;
    }
    if (input.deferTerminalPersistence === true) {
      throw error;
    }
    const failurePhase = (await input.deps.requests.findById(requestId))?.exercise_id
      ? "images"
      : "text";
    try {
      await throwDraftGenerationFailure(error, failurePhase, requestId, loadView);
    } catch (terminal) {
      if (terminal instanceof DraftGenerationTerminalFailure) {
        await persistDraftGenerationTerminalFailure({
          requests: input.deps.requests,
          requestId,
          attemptId,
          terminal: terminal.terminal,
        });
        throw terminal;
      }
      throw terminal;
    }
    throw new Error("unreachable draft generation failure path");
  } finally {
    if (input.releaseLockOnFinish !== false) {
      const now = input.deps.now();
      const held = await input.deps.requests.getDraftGenerationLockedAt(requestId);
      const released = await input.deps.requests.releaseDraftGenerationLock(
        requestId,
        attemptId,
      );
      if (released) {
        logDraftGenerationLockReleased({ requestId, lockedAt: held, now });
      }
    }
  }
  throw new ExerciseRequestsServiceError(
    "Draft generation ended without a result",
    "draft_not_ready",
  );
}
