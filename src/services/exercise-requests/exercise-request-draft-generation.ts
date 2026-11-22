import { ExerciseRequestsServiceError } from "./errors.js";
import type {
  ExerciseRequestDraftView,
  GenerateExerciseRequestDraftResult,
} from "./types.js";
import type { ExerciseMediaService } from "../exercise-media/exercise-media-service.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
} from "../../storage/repositories/exercise-data.js";
import { ExerciseVersionMediaRepository } from "../../storage/repositories/exercise-media.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import type { ExerciseDraftGenerator } from "./exercise-draft-generator-types.js";
import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import {
  DRAFT_GENERATION_LOCK_STALE_MS,
  isLockFresh,
} from "./draft-generation-lock.js";
import type { DraftGenerationWorkflowPort } from "./draft-generation-workflow-types.js";
import { logDraftGenerationLockAcquired } from "./draft-generation-lock-log.js";

export {
  DRAFT_GENERATION_LOCK_STALE_MS,
  isLockFresh,
} from "./draft-generation-lock.js";

type GenerateDraftDeps = {
  sql: SqlStoragePort;
  draftGenerator: ExerciseDraftGenerator;
  now: () => string;
  requests: ExerciseRequestsRepository;
  exercises: ExercisesRepository;
  versions: ExerciseVersionsRepository;
  versionMedia: ExerciseVersionMediaRepository;
  workflow: DraftGenerationWorkflowPort;
};

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

  const view = await input.loadView(requestId);
  if (view.generation.first_draft_complete) {
    return { outcome: "complete", view };
  }

  const now = input.deps.now();
  const lockedAt = await input.deps.requests.getDraftGenerationLockedAt(requestId);
  if (isLockFresh(lockedAt, now)) {
    return {
      outcome: "in_progress",
      view,
      started_elsewhere: true,
    };
  }

  const lockHeldAt = now;
  const staleBefore = new Date(
    Date.parse(now) - DRAFT_GENERATION_LOCK_STALE_MS,
  ).toISOString();
  const acquired = await input.deps.requests.tryAcquireDraftGenerationLock({
    requestId,
    lockedAt: lockHeldAt,
    staleBefore,
  });
  if (!acquired) {
    const busyView = await input.loadView(requestId);
    return {
      outcome: "in_progress",
      view: busyView,
      started_elsewhere: true,
    };
  }

  logDraftGenerationLockAcquired({
    requestId,
    lockedAt: lockHeldAt,
    now,
  });

  const startResult = await input.deps.workflow.start({
    requestId,
    practitionerId: input.practitionerId,
  });

  if (startResult === "already_running") {
    await input.deps.requests.releaseDraftGenerationLockByRequestId(requestId);
    const busyView = await input.loadView(requestId);
    return {
      outcome: "in_progress",
      view: busyView,
      started_elsewhere: true,
    };
  }

  const startedView = await input.loadView(requestId);
  return {
    outcome: "in_progress",
    view: startedView,
    started_elsewhere: false,
  };
}
