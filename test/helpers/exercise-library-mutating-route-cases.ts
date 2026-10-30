export type ExerciseLibraryMutatingHttpRouteCase = {
  readonly method: string;
  readonly path: string;
};

/** Test-only samples for exercise library mutating routes handled by `handleExerciseLibraryRequest`. */
export function exerciseLibraryMutatingHttpRouteCases(
  practitionerId: string,
  exerciseId: string,
): readonly ExerciseLibraryMutatingHttpRouteCase[] {
  const itemPath = `/api/practitioners/${practitionerId}/my-exercises/${exerciseId}`;
  return [
    { method: "POST", path: itemPath },
    { method: "PATCH", path: itemPath },
    { method: "DELETE", path: itemPath },
  ];
}
