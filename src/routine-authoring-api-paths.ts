/** Session-only routine authoring API (DIDI-1021). */

export const ROUTINES_AUTHORING_COLLECTION_PATH = "/api/me/routines";

export function routineAuthoringItemPath(routineId: string): string {
  return `${ROUTINES_AUTHORING_COLLECTION_PATH}/${encodeURIComponent(routineId)}`;
}

export function routineVersionHistoryPath(routineId: string): string {
  return `${routineAuthoringItemPath(routineId)}/versions`;
}
