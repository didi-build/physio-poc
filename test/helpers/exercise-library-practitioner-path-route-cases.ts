import {
  EXERCISE_LIBRARY_APPROVED_SEARCH_PATH,
  EXERCISE_LIBRARY_MY_EXERCISES_PATH,
  exerciseLibraryExerciseDetailsPath,
  exerciseLibraryMyExerciseItemPath,
} from "../../src/exercise-library-api-paths.js";

export type ExerciseLibraryPractitionerPathHttpRouteCase = {
  readonly method: string;
  readonly path: string;
};

/** Sample paths for session-scoped exercise library routes under `/api/me/`. */
export function exerciseLibraryPractitionerPathHttpRouteCases(
  _practitionerId: string,
  exerciseId: string,
): readonly ExerciseLibraryPractitionerPathHttpRouteCase[] {
  const itemPath = exerciseLibraryMyExerciseItemPath(exerciseId);
  return [
    { method: "GET", path: EXERCISE_LIBRARY_APPROVED_SEARCH_PATH },
    { method: "GET", path: exerciseLibraryExerciseDetailsPath(exerciseId) },
    { method: "GET", path: EXERCISE_LIBRARY_MY_EXERCISES_PATH },
    { method: "POST", path: itemPath },
    { method: "PATCH", path: itemPath },
    { method: "DELETE", path: itemPath },
  ];
}
