/**
 * Web app route paths (UI). Single source for React Router and in-app links.
 */

export const APP_ROUTE_PATHS = {
  root: "/",
  exercises: "/exercises",
  exercisesSearch: "/exercises/search",
  exerciseDetails: "/exercises/:exerciseId",
  exerciseMyCopy: "/exercises/:exerciseId/my-copy",
  routines: "/routines",
  programs: "/programs",
  requests: "/requests",
  defaults: "/defaults",
} as const;

export function exerciseDetailsPath(exerciseId: string): string {
  return `/exercises/${encodeURIComponent(exerciseId)}`;
}

export function exerciseMyCopyPath(exerciseId: string): string {
  return `/exercises/${encodeURIComponent(exerciseId)}/my-copy`;
}

export function exercisesSearchPath(query: string): string {
  const params = new URLSearchParams();
  params.set("q", query);
  return `${APP_ROUTE_PATHS.exercisesSearch}?${params.toString()}`;
}
