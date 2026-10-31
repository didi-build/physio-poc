/** Session-only exercise requests API (DIDI-1006 route convention). */
export const EXERCISE_REQUESTS_API_BASE = "/api/me/exercise-requests";

export function exerciseRequestsSimilarPath(query = ""): string {
  const suffix = query ? `?${query}` : "";
  return `${EXERCISE_REQUESTS_API_BASE}/similar${suffix}`;
}

export function exerciseRequestsInProgressPath(): string {
  return `${EXERCISE_REQUESTS_API_BASE}/in-progress`;
}

export function exerciseRequestsInProgressCountPath(): string {
  return `${EXERCISE_REQUESTS_API_BASE}/in-progress/count`;
}

export function exerciseRequestsCollectionPath(): string {
  return EXERCISE_REQUESTS_API_BASE;
}

export function exerciseRequestPath(requestId: string): string {
  return `${EXERCISE_REQUESTS_API_BASE}/${encodeURIComponent(requestId)}`;
}

export function exerciseRequestDraftPath(requestId: string): string {
  return `${exerciseRequestPath(requestId)}/draft`;
}

export function exerciseRequestApprovePath(requestId: string): string {
  return `${exerciseRequestPath(requestId)}/approve`;
}
