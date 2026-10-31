export type ExerciseLibraryPractitionerPathHttpRouteCase = {
  readonly method: string;
  readonly path: string;
};

/** Sample paths for exercise library routes with a `:practitionerId` path segment. */
export function exerciseLibraryPractitionerPathHttpRouteCases(
  practitionerId: string,
  exerciseId: string,
): readonly ExerciseLibraryPractitionerPathHttpRouteCase[] {
  const base = `/api/practitioners/${practitionerId}`;
  const itemPath = `${base}/my-exercises/${exerciseId}`;
  return [
    { method: "GET", path: `${base}/exercises/approved/search` },
    { method: "GET", path: `${base}/exercises/${exerciseId}` },
    { method: "GET", path: `${base}/my-exercises` },
    { method: "POST", path: itemPath },
    { method: "PATCH", path: itemPath },
    { method: "DELETE", path: itemPath },
  ];
}
