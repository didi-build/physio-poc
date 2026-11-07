/** Session-only routines library API (DIDI-1018). */

export const ROUTINES_COMMUNITY_SEARCH_PATH = "/api/me/routines/community/search";

export const ROUTINES_MY_ROUTINES_PATH = "/api/me/my-routines";

export function routineDetailsPath(routineId: string): string {
  return `/api/me/routines/${encodeURIComponent(routineId)}`;
}

export function routineMyCopyPath(routineId: string): string {
  return `${ROUTINES_MY_ROUTINES_PATH}/${encodeURIComponent(routineId)}`;
}

export function routineSentProgramsPath(routineId: string): string {
  return `/api/me/routines/${encodeURIComponent(routineId)}/sent-programs`;
}
