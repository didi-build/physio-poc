import type { ExerciseRequestDraftView } from "./types.js";
import { ExerciseRequestsRepository } from "../../storage/repositories/exercise-data.js";
import {
  DRAFT_GENERATION_LOCK_STALE_MS,
  isLockFresh,
} from "./draft-generation-lock.js";
import { logDraftGenerationLockAcquired } from "./draft-generation-lock-log.js";

export type DraftGenerationLockOutcome<T> =
  | { kind: "in_progress"; view: ExerciseRequestDraftView; started_elsewhere: boolean }
  | { kind: "ran"; result: T };

export async function underDraftGenerationLock<T>(input: {
  requestId: string;
  now: string;
  requests: ExerciseRequestsRepository;
  loadView: () => Promise<ExerciseRequestDraftView>;
  run: () => Promise<T>;
}): Promise<DraftGenerationLockOutcome<T>> {
  const lockedAt = await input.requests.getDraftGenerationLockedAt(input.requestId);
  if (isLockFresh(lockedAt, input.now)) {
    const view = await input.loadView();
    return { kind: "in_progress", view, started_elsewhere: true };
  }

  const lockHeldAt = input.now;
  const attemptId = crypto.randomUUID();
  const staleBefore = new Date(
    Date.parse(input.now) - DRAFT_GENERATION_LOCK_STALE_MS,
  ).toISOString();
  const acquired = await input.requests.tryAcquireDraftGenerationLock({
    requestId: input.requestId,
    lockedAt: lockHeldAt,
    staleBefore,
    attemptId,
  });
  if (!acquired) {
    const view = await input.loadView();
    return { kind: "in_progress", view, started_elsewhere: true };
  }

  logDraftGenerationLockAcquired({
    requestId: input.requestId,
    lockedAt: lockHeldAt,
    now: input.now,
  });

  try {
    const result = await input.run();
    return { kind: "ran", result };
  } finally {
    await input.requests.releaseDraftGenerationLock(input.requestId, attemptId);
  }
}
