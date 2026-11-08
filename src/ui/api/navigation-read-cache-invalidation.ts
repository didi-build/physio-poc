import {
  isExerciseDetailKey,
  isExercisesListKey,
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

/** Request submit/approve changes My exercises "new from requests" sections. */
export function invalidateAfterExerciseRequestMutation(): void {
  invalidateAfterExerciseLibraryMutation();
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
