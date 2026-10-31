import { exerciseLibraryPractitionerPathHttpRouteCases } from "./exercise-library-practitioner-path-route-cases.js";

export type ExerciseLibraryMutatingHttpRouteCase = {
  readonly method: string;
  readonly path: string;
};

/** Test-only samples for exercise library mutating routes handled by `handleExerciseLibraryRequest`. */
export function exerciseLibraryMutatingHttpRouteCases(
  practitionerId: string,
  exerciseId: string,
): readonly ExerciseLibraryMutatingHttpRouteCase[] {
  return exerciseLibraryPractitionerPathHttpRouteCases(
    practitionerId,
    exerciseId,
  ).filter((routeCase) => routeCase.method !== "GET");
}
