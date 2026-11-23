export const DRAFT_GENERATION_LOCK_ACQUIRED_EVENT =
  "physio_draft_generation_lock_acquired";
export const DRAFT_GENERATION_LOCK_REFRESHED_EVENT =
  "physio_draft_generation_lock_refreshed";
export const DRAFT_GENERATION_LOCK_RELEASED_EVENT =
  "physio_draft_generation_lock_released";
export const DRAFT_GENERATION_STEP_STARTED_EVENT =
  "physio_draft_generation_step_started";
export const DRAFT_GENERATION_STEP_ENDED_EVENT = "physio_draft_generation_step_ended";
export const DRAFT_GENERATION_RUN_CANCELED_EVENT =
  "physio_draft_generation_run_canceled";
export const DRAFT_GENERATION_RUN_ABANDONED_EVENT =
  "physio_draft_generation_run_abandoned";

export type DraftGenerationStepName = "text" | "start_image" | "end_image" | "finalize";

function lockAgeMs(lockedAt: string | null, nowIso: string): number | null {
  if (!lockedAt) {
    return null;
  }
  const age = Date.parse(nowIso) - Date.parse(lockedAt);
  return Number.isFinite(age) && age >= 0 ? age : null;
}

export function logDraftGenerationLockAcquired(input: {
  requestId: string;
  lockedAt: string;
  now: string;
}): void {
  console.log(
    JSON.stringify({
      event: DRAFT_GENERATION_LOCK_ACQUIRED_EVENT,
      request_id: input.requestId,
      lock_age_ms: lockAgeMs(input.lockedAt, input.now),
    }),
  );
}

export function logDraftGenerationLockRefreshed(input: {
  requestId: string;
  lockedAt: string;
  now: string;
}): void {
  console.log(
    JSON.stringify({
      event: DRAFT_GENERATION_LOCK_REFRESHED_EVENT,
      request_id: input.requestId,
      lock_age_ms: lockAgeMs(input.lockedAt, input.now),
    }),
  );
}

export function logDraftGenerationLockReleased(input: {
  requestId: string;
  lockedAt: string | null;
  now: string;
}): void {
  console.log(
    JSON.stringify({
      event: DRAFT_GENERATION_LOCK_RELEASED_EVENT,
      request_id: input.requestId,
      lock_age_ms: lockAgeMs(input.lockedAt, input.now),
    }),
  );
}

export function logDraftGenerationStepStarted(input: {
  requestId: string;
  step: DraftGenerationStepName;
}): void {
  console.log(
    JSON.stringify({
      event: DRAFT_GENERATION_STEP_STARTED_EVENT,
      request_id: input.requestId,
      step: input.step,
    }),
  );
}

export function logDraftGenerationStepEnded(input: {
  requestId: string;
  step: DraftGenerationStepName;
  durationMs: number;
  outcome: "ok" | "failed";
}): void {
  console.log(
    JSON.stringify({
      event: DRAFT_GENERATION_STEP_ENDED_EVENT,
      request_id: input.requestId,
      step: input.step,
      duration_ms: input.durationMs,
      outcome: input.outcome,
    }),
  );
}

export function logDraftGenerationRunCanceled(input: {
  requestId: string;
  attemptId: string;
  lockedAt: string | null;
  now: string;
}): void {
  console.log(
    JSON.stringify({
      event: DRAFT_GENERATION_RUN_CANCELED_EVENT,
      request_id: input.requestId,
      attempt_id: input.attemptId,
      lock_age_ms: lockAgeMs(input.lockedAt, input.now),
    }),
  );
}

export function logDraftGenerationRunAbandoned(input: {
  requestId: string;
  attemptId: string;
  lockedAt: string | null;
  now: string;
}): void {
  console.log(
    JSON.stringify({
      event: DRAFT_GENERATION_RUN_ABANDONED_EVENT,
      request_id: input.requestId,
      attempt_id: input.attemptId,
      lock_age_ms: lockAgeMs(input.lockedAt, input.now),
    }),
  );
}
