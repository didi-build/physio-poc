/**
 * Web app URL helpers for the MCP connector (runtime-neutral).
 * Route patterns live in src/app-routes.ts.
 */

export {
  EXERCISE_SEARCH_QUERY_PARAM,
  FROM_ROUTINE_ID_QUERY_PARAM,
  buildPhysioAppUrl,
  buildProgramBuilderLink,
  buildWebAppExerciseSearchUrl,
  normalizeWebAppBaseUrl,
  PHYSIO_APP_ROUTE_PATTERNS,
  type ConnectorPhysioAppRouteName,
  type FillPhysioAppRouteParams,
  type PhysioAppRouteName,
} from "../app-routes.js";

/** @deprecated Use PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch */
export const WEB_APP_EXERCISE_SEARCH_PATH = "/exercises/search";

/** @deprecated Use EXERCISE_SEARCH_QUERY_PARAM */
export const WEB_APP_EXERCISE_SEARCH_QUERY_PARAM = "q";
