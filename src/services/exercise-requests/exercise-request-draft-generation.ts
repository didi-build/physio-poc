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
import { underDraftGenerationLock } from "./exercise-request-generation-lock.js";
import {
  logDraftGenerationFailed,
  type DraftGenerationFailurePhase,
} from "./draft-generation-failure-log.js";

/** Locks older than this may be taken over by a new generate call. */
export const DRAFT_GENERATION_LOCK_STALE_MS = 15 * 60 * 1000;

type GenerateDraftDeps = {
  sql: SqlStoragePort;
  draftGenerator: ExerciseDraftGenerator;
  now: () => string;
  requests: ExerciseRequestsRepository;
  exercises: ExercisesRepository;
  versions: ExerciseVersionsRepository;
  versionMedia: ExerciseVersionMediaRepository;
};

export function isLockFresh(lockedAt: string | null, nowIso: string): boolean {
  if (!lockedAt) {
    return false;
  }
  const ageMs = Date.parse(nowIso) - Date.parse(lockedAt);
  return ageMs >= 0 && ageMs < DRAFT_GENERATION_LOCK_STALE_MS;
}

async function hasDraftMedia(
  versionMedia: ExerciseVersionMediaRepository,
  exerciseVersionId: string,
): Promise<boolean> {
  const row = await versionMedia.findVersion(exerciseVersionId);
  return typeof row?.media_set_id === "string" && row.media_set_id.length > 0;
}

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

async function mapUnexpectedGenerateFailure(
  error: unknown,
  phase: DraftGenerationFailurePhase,
  requestId: string,
  loadView: () => Promise<ExerciseRequestDraftView>,
): Promise<GenerateExerciseRequestDraftResult> {
  logDraftGenerationFailed({ requestId, phase, error, httpStatus: 502 });
  if (phase === "text") {
    return {
      outcome: "text_failed",
      error: "unexpected_generation_failure",
      view: null,
    };
  }
  const view = await loadView();
  return { outcome: "images_failed", view };
}

export async function generateExerciseRequestDraft(input: {
  practitionerId: string;
  requestId: string;
  mediaService: ExerciseMediaService;
  loadView: (requestId: string) => Promise<ExerciseRequestDraftView>;
  deps: GenerateDraftDeps;
}): Promise<GenerateExerciseRequestDraftResult> {
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

  const now = input.deps.now();
  const locked = await underDraftGenerationLock({
    requestId,
    now,
    requests: input.deps.requests,
    loadView: () => input.loadView(requestId),
    run: async () => {
      const loadView = () => input.loadView(requestId);
      try {
        let exerciseId = row.exercise_id;
        let versionId: string | null = null;

        if (!exerciseId) {
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
            exerciseId = generated.exerciseId;
            versionId = generated.versionId;
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
            return mapUnexpectedGenerateFailure(error, "text", requestId, loadView);
          }
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
            try {
              await input.deps.draftGenerator(
                {
                  sql: input.deps.sql,
                  requestId,
                  requestedName: row.requested_name,
                  exerciseNote: row.note,
                  requestedBy: row.requested_by,
                  now,
                  existingExerciseId: exerciseId,
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
                return {
                  outcome: "text_failed" as const,
                  error: error.code,
                  view: null,
                };
              }
              return mapUnexpectedGenerateFailure(error, "text", requestId, loadView);
            }
          }
        }

        if (!exerciseId || !versionId) {
          throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
        }

        const mediaReady = await hasDraftMedia(input.deps.versionMedia, versionId);
        if (!mediaReady) {
          try {
            await input.mediaService.generateInitialMediaForVersion({
              practitionerId: input.practitionerId,
              exerciseVersionId: versionId,
              countTowardDailyQuota: false,
            });
          } catch (error) {
            if (error instanceof ExerciseMediaServiceError) {
              if (error.code === "daily_limit_reached") {
                const view = await loadView();
                return { outcome: "daily_limit" as const, view };
              }
              if (error.code === "exercise_media_already_generated") {
                // Idempotent: another call finished images.
              } else {
                const view = await loadView();
                return { outcome: "images_failed" as const, view };
              }
            } else if (error instanceof ImageGenerationError) {
              const view = await loadView();
              return { outcome: "images_failed" as const, view };
            } else {
              return mapUnexpectedGenerateFailure(error, "images", requestId, loadView);
            }
          }
        }

        let view: ExerciseRequestDraftView;
        try {
          view = await loadView();
        } catch (error) {
          return mapUnexpectedGenerateFailure(error, "persist", requestId, loadView);
        }
        return { outcome: "complete" as const, view };
      } catch (error) {
        if (error instanceof ExerciseRequestsServiceError) {
          throw error;
        }
        return mapUnexpectedGenerateFailure(error, "persist", requestId, loadView);
      }
    },
  });
  if (locked.kind === "in_progress") {
    return {
      outcome: "in_progress",
      view: locked.view,
      started_elsewhere: locked.started_elsewhere,
    };
  }
  return locked.result;
}
