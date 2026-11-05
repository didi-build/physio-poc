/** Session-only exercise media mutation and quota API (DIDI-1059). */
export const EXERCISE_MEDIA_REGENERATION_QUOTA_PATH =
  "/api/me/media-regeneration-quota";

export function exerciseMediaGeneratePath(exerciseVersionId: string): string {
  return `/api/me/exercise-versions/${encodeURIComponent(exerciseVersionId)}/media/generate`;
}

export function exerciseMediaRegeneratePath(exerciseVersionId: string): string {
  return `/api/me/exercise-versions/${encodeURIComponent(exerciseVersionId)}/media/regenerate`;
}

/** Public or internal media serve (not under /api/me). */
export function exerciseMediaServePath(exerciseVersionId: string): string {
  return `/api/exercise-versions/${encodeURIComponent(exerciseVersionId)}/media`;
}
