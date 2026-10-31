import {
  exerciseRequestsCollectionPath,
  EXERCISE_REQUESTS_API_BASE,
} from "../../src/exercise-requests-api-paths.js";
import {
  exerciseRequestsHttpRouteCases,
  exerciseRequestsMutatingHttpRouteCases,
  type ExerciseRequestsHttpRouteCase,
} from "../../src/http/routes/exercise-requests.js";

export type { ExerciseRequestsHttpRouteCase };

export { exerciseRequestsHttpRouteCases, exerciseRequestsMutatingHttpRouteCases };

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
    return undefined;
  }
  return undefined;
}

export function exerciseRequestsApiBasePath(): string {
  return EXERCISE_REQUESTS_API_BASE;
}
