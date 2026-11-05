/** Session-only exercise library API (DIDI-1059). */
export const EXERCISE_LIBRARY_APPROVED_SEARCH_PATH =
  "/api/me/exercises/approved/search";

export const EXERCISE_LIBRARY_MY_EXERCISES_PATH = "/api/me/my-exercises";

export function exerciseLibraryExerciseDetailsPath(exerciseId: string): string {
  return `/api/me/exercises/${encodeURIComponent(exerciseId)}`;
}

export function exerciseLibraryMyExerciseItemPath(exerciseId: string): string {
  return `${EXERCISE_LIBRARY_MY_EXERCISES_PATH}/${encodeURIComponent(exerciseId)}`;
}
