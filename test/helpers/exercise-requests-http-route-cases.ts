import {
  exerciseRequestApprovePath,
  exerciseRequestDraftPath,
  exerciseRequestPath,
  exerciseRequestsCollectionPath,
  exerciseRequestsInProgressCountPath,
  exerciseRequestsInProgressPath,
  EXERCISE_REQUESTS_API_BASE,
} from "../../src/exercise-requests-api-paths.js";

export type ExerciseRequestsHttpRouteCase = {
  readonly method: string;
  readonly path: string;
};

export const EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID =
  "00000000-0000-4000-8000-00001f7b01a3";

export const EXERCISE_REQUESTS_HTTP_ROUTE_TABLE: readonly ExerciseRequestsHttpRouteCase[] =
  [
    { method: "GET", path: `${EXERCISE_REQUESTS_API_BASE}/similar` },
    { method: "GET", path: exerciseRequestsInProgressPath() },
    { method: "GET", path: exerciseRequestsInProgressCountPath() },
    { method: "POST", path: exerciseRequestsCollectionPath() },
    {
      method: "GET",
      path: exerciseRequestPath(EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID),
    },
    {
      method: "PATCH",
      path: exerciseRequestDraftPath(EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID),
    },
    {
      method: "POST",
      path: exerciseRequestApprovePath(EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID),
    },
  ];

export function exerciseRequestsHttpRouteCases(
  requestId: string = EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID,
): readonly ExerciseRequestsHttpRouteCase[] {
  if (requestId === EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID) {
    return EXERCISE_REQUESTS_HTTP_ROUTE_TABLE;
  }
  return [
    { method: "GET", path: `${EXERCISE_REQUESTS_API_BASE}/similar` },
    { method: "GET", path: exerciseRequestsInProgressPath() },
    { method: "GET", path: exerciseRequestsInProgressCountPath() },
    { method: "POST", path: exerciseRequestsCollectionPath() },
    { method: "GET", path: exerciseRequestPath(requestId) },
    { method: "PATCH", path: exerciseRequestDraftPath(requestId) },
    { method: "POST", path: exerciseRequestApprovePath(requestId) },
  ];
}

export function exerciseRequestsMutatingHttpRouteCases(
  requestId: string = EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID,
): readonly ExerciseRequestsHttpRouteCase[] {
  return exerciseRequestsHttpRouteCases(requestId).filter((routeCase) =>
    ["POST", "PATCH"].includes(routeCase.method),
  );
}

export function exerciseRequestsHttpJsonBody(
  routeCase: ExerciseRequestsHttpRouteCase,
): string | undefined {
  if (routeCase.method === "GET") {
    return undefined;
  }
  if (routeCase.path === exerciseRequestsCollectionPath()) {
    return JSON.stringify({
      requested_name: "Heel slide",
      form_opened_at: "2026-10-30T10:00:00.000Z",
    });
  }
  if (routeCase.path.endsWith("/draft")) {
    return JSON.stringify({ title: "Edited title" });
  }
  if (routeCase.path.endsWith("/approve")) {
    return "{}";
  }
  return undefined;
}

export function exerciseRequestsApiBasePath(): string {
  return EXERCISE_REQUESTS_API_BASE;
}
