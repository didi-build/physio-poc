/**
 * Shared web app route patterns (runtime-neutral).
 * Used by the SPA router and the MCP connector for deep links.
 * Nav list paths match design/README.md (Shared layout).
 */

import { validateFreeTextForPatientDetails } from "./mcp-connector/patient-detail-validator.js";

export const PHYSIO_APP_ROUTE_PATTERNS = {
  exercises: "/exercises",
  exerciseSearch: "/exercises/search",
  routines: "/routines",
  programs: "/programs",
  requests: "/requests",
  defaults: "/defaults",
  programNew: "/programs/new",
  programBuilder: "/programs/:programCode",
  programPublish: "/programs/:programCode/publish",
  programShare: "/programs/:programCode/share",
} as const;

export type PhysioAppRouteName = keyof typeof PHYSIO_APP_ROUTE_PATTERNS;

/** Routes the MCP connector may embed in tool responses (pinned by test). */
export const CONNECTOR_PHYSIO_APP_ROUTE_NAMES = [
  "exerciseSearch",
  "exercises",
  "routines",
  "programNew",
  "programBuilder",
  "programPublish",
  "programShare",
] as const;

export type ConnectorPhysioAppRouteName =
  (typeof CONNECTOR_PHYSIO_APP_ROUTE_NAMES)[number];

export const EXERCISE_SEARCH_QUERY_PARAM = "q";
export const MAX_EXERCISE_SEARCH_QUERY_LENGTH = 200;
export const FROM_ROUTINE_ID_QUERY_PARAM = "from_routine_id";

export type FillPhysioAppRouteParams = {
  readonly programCode?: string;
};

export function fillPhysioAppRoutePattern(
  routeName: PhysioAppRouteName,
  params: FillPhysioAppRouteParams = {},
): string {
  let path: string = PHYSIO_APP_ROUTE_PATTERNS[routeName];
  if (path.includes(":programCode")) {
    const code = params.programCode?.trim();
    if (!code) {
      throw new Error(`Route ${routeName} requires programCode`);
    }
    path = path.replace(":programCode", encodeURIComponent(code));
  }
  return path;
}

export function normalizeWebAppBaseUrl(webAppBaseUrl: string): string {
  let base = webAppBaseUrl;
  while (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

/** React Router `path` values (no leading slash) derived from PHYSIO_APP_ROUTE_PATTERNS. */
export function physioAppSpaRoutePath(routeName: PhysioAppRouteName): string {
  const pattern = PHYSIO_APP_ROUTE_PATTERNS[routeName];
  return pattern.startsWith("/") ? pattern.slice(1) : pattern;
}

export const PHYSIO_APP_SPA_ROUTE_NAMES = [
  "exercises",
  "exerciseSearch",
  "routines",
  "programs",
  "programNew",
  "programBuilder",
  "programPublish",
  "programShare",
  "requests",
  "defaults",
] as const;

export type PhysioAppSpaRouteName = (typeof PHYSIO_APP_SPA_ROUTE_NAMES)[number];

export function buildPhysioAppUrl(
  webAppBaseUrl: string,
  routeName: PhysioAppRouteName,
  options: {
    readonly routeParams?: FillPhysioAppRouteParams;
    readonly query?: Record<string, string>;
  } = {},
): string {
  const base = normalizeWebAppBaseUrl(webAppBaseUrl);
  const path = fillPhysioAppRoutePattern(routeName, options.routeParams ?? {});
  const url = `${base}${path}`;
  const query = options.query;
  if (!query || Object.keys(query).length === 0) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    params.set(key, value);
  }
  return `${url}?${params.toString()}`;
}

export function buildWebAppExerciseSearchUrl(
  webAppBaseUrl: string,
  exerciseName: string,
): string {
  const capped = exerciseName.slice(0, MAX_EXERCISE_SEARCH_QUERY_LENGTH);
  const validation = validateFreeTextForPatientDetails(capped);
  if (!validation.ok) {
    return buildPhysioAppUrl(webAppBaseUrl, "exerciseSearch");
  }
  return buildPhysioAppUrl(webAppBaseUrl, "exerciseSearch", {
    query: { [EXERCISE_SEARCH_QUERY_PARAM]: capped },
  });
}

export function buildProgramBuilderLink(
  webAppBaseUrl: string,
  input: {
    readonly program_code?: string;
    readonly from_routine_id?: string;
  },
): string {
  const code =
    typeof input.program_code === "string" && input.program_code.trim().length > 0
      ? input.program_code.trim()
      : undefined;
  const routineId =
    typeof input.from_routine_id === "string" && input.from_routine_id.trim().length > 0
      ? input.from_routine_id.trim()
      : undefined;

  if (code) {
    return buildPhysioAppUrl(webAppBaseUrl, "programBuilder", {
      routeParams: { programCode: code },
    });
  }
  if (routineId) {
    return buildPhysioAppUrl(webAppBaseUrl, "programNew", {
      query: { [FROM_ROUTINE_ID_QUERY_PARAM]: routineId },
    });
  }
  return buildPhysioAppUrl(webAppBaseUrl, "programNew");
}
