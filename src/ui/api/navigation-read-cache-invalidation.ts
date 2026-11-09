import {
  isExerciseDetailKey,
  isExerciseMediaRegenerationQuotaKey,
  isExerciseRequestDetailKey,
  isExerciseRequestsInProgressCountKey,
  isExerciseRequestsInProgressListKey,
  isExerciseRequestsSimilarKey,
  isExercisesListKey,
  isMyDefaultsPageKey,
  isProgramBuilderKey,
  isProgramsListKey,
  isRoutineDetailKey,
  isRoutinesListKey,
} from "./navigation-read-cache-keys.js";
import { getSessionReadCache } from "./session-read-cache.js";

export function invalidateAfterExerciseLibraryMutation(exerciseId?: string): void {
  const cache = getSessionReadCache();
  cache.invalidateMatching(
    (key) =>
      isExercisesListKey(key) ||
      isExerciseDetailKey(key, exerciseId) ||
      isProgramBuilderKey(key),
  );
}

export function invalidateExerciseRequestReads(requestId?: string): void {
  const cache = getSessionReadCache();
  cache.invalidateMatching(
    (key) =>
      isExerciseRequestsInProgressListKey(key) ||
      isExerciseRequestsInProgressCountKey(key) ||
      isExerciseRequestDetailKey(key, requestId) ||
      isExerciseRequestsSimilarKey(key),
  );
}

/** Request submit/approve changes My exercises "new from requests" sections. */
export function invalidateAfterExerciseRequestMutation(requestId?: string): void {
  invalidateAfterExerciseLibraryMutation();
  invalidateExerciseRequestReads(requestId);
}

/** Draft edits change list/detail snapshots without touching the exercise library cache. */
export function invalidateAfterExerciseRequestDraftMutation(requestId: string): void {
  invalidateExerciseRequestReads(requestId);
}

export function invalidateAfterExerciseMediaRegeneration(): void {
  const cache = getSessionReadCache();
  cache.invalidateMatching((key) => isExerciseMediaRegenerationQuotaKey(key));
}

/**
 * My defaults dose/link expiry feed program builder row projections (`practitioner_defaults`);
 * exercise library detail does not surface those resolved params in the POC UI.
 */
export function invalidateAfterMyDefaultsMutation(): void {
  const cache = getSessionReadCache();
  cache.invalidateMatching(
    (key) => isMyDefaultsPageKey(key) || isProgramBuilderKey(key),
  );
}

export function invalidateAfterRoutineLibraryMutation(routineId?: string): void {
  const cache = getSessionReadCache();
  cache.invalidateMatching(
    (key) =>
      isRoutinesListKey(key) ||
      isRoutineDetailKey(key, routineId) ||
      isProgramsListKey(key) ||
      isProgramBuilderKey(key),
  );
}

export function invalidateAfterProgramsListMutation(): void {
  const cache = getSessionReadCache();
  cache.invalidateMatching((key) => isProgramsListKey(key));
}

export function invalidateAfterProgramBuilderMutation(programCode?: string): void {
  const cache = getSessionReadCache();
  cache.invalidateMatching(
    (key) => isProgramsListKey(key) || isProgramBuilderKey(key, programCode),
  );
}
