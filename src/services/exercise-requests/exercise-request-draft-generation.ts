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

function isLockFresh(lockedAt: string | null, nowIso: string): boolean {
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
  const lockedAt = await input.deps.requests.getDraftGenerationLockedAt(requestId);
  if (isLockFresh(lockedAt, now)) {
    const view = await input.loadView(requestId);
    return { outcome: "in_progress", view, started_elsewhere: false };
  }

  const acquired = await input.deps.requests.tryAcquireDraftGenerationLock({
    requestId,
    lockedAt: now,
    staleBefore: new Date(
      Date.parse(now) - DRAFT_GENERATION_LOCK_STALE_MS,
    ).toISOString(),
  });
  if (!acquired) {
    const view = await input.loadView(requestId);
    return { outcome: "in_progress", view, started_elsewhere: true };
  }

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
          return { outcome: "text_failed", error: error.code, view: null };
        }
        if (error instanceof ExerciseRequestsServiceError) {
          throw error;
        }
        throw error;
      }
    } else {
      const draft = await input.deps.versions.findDraftForExercise(exerciseId);
      versionId = draft?.id ?? null;
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
            const view = await input.loadView(requestId);
            return { outcome: "daily_limit", view };
          }
          if (error.code === "exercise_media_already_generated") {
            // Idempotent: another call finished images.
          } else {
            const view = await input.loadView(requestId);
            return { outcome: "images_failed", view };
          }
        } else if (error instanceof ImageGenerationError) {
          const view = await input.loadView(requestId);
          return { outcome: "images_failed", view };
        } else {
          throw error;
        }
      }
    }

    const view = await input.loadView(requestId);
    return { outcome: "complete", view };
  } finally {
    await input.deps.requests.releaseDraftGenerationLock(requestId);
  }
}
