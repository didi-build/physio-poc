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
  /** Stub MCP share link path segment (not an in-app SPA screen). */
  stubPublicShareLink: "/l/stub-share",
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
/** URL-encoded `q` must stay strictly under 200 characters (max 199 encoded). */
export const MAX_ENCODED_EXERCISE_SEARCH_QUERY_LENGTH = 199;
/** @deprecated Prefer measuring encoded length via MAX_ENCODED_EXERCISE_SEARCH_QUERY_LENGTH. */
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

function encodedExerciseSearchQueryParamValue(raw: string): string {
  const serialized = new URLSearchParams({
    [EXERCISE_SEARCH_QUERY_PARAM]: raw,
  }).toString();
  const prefix = `${EXERCISE_SEARCH_QUERY_PARAM}=`;
  return serialized.startsWith(prefix) ? serialized.slice(prefix.length) : "";
}

export function encodedExerciseSearchQueryLength(raw: string): number {
  return encodedExerciseSearchQueryParamValue(raw).length;
}

/** Truncate raw search text so URL-encoded `q` is at most 199 characters. */
export function capRawExerciseSearchQueryForUrl(raw: string): string {
  let codePoints = [...raw];
  while (
    codePoints.length > 0 &&
    encodedExerciseSearchQueryLength(codePoints.join("")) >
      MAX_ENCODED_EXERCISE_SEARCH_QUERY_LENGTH
  ) {
    codePoints = codePoints.slice(0, -1);
  }
  return codePoints.join("");
}

export function buildStubPublicShareLink(webAppBaseUrl: string): string {
  return `${normalizeWebAppBaseUrl(webAppBaseUrl)}${PHYSIO_APP_ROUTE_PATTERNS.stubPublicShareLink}`;
}

export function buildWebAppExerciseSearchUrl(
  webAppBaseUrl: string,
  exerciseName: string,
): string {
  const validation = validateFreeTextForPatientDetails(exerciseName);
  if (!validation.ok) {
    return buildPhysioAppUrl(webAppBaseUrl, "exerciseSearch");
  }
  const capped = capRawExerciseSearchQueryForUrl(exerciseName);
  if (capped.length === 0) {
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

/** @deprecated Use PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch */
export const WEB_APP_EXERCISE_SEARCH_PATH = PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch;

/** @deprecated Use EXERCISE_SEARCH_QUERY_PARAM */
export const WEB_APP_EXERCISE_SEARCH_QUERY_PARAM = EXERCISE_SEARCH_QUERY_PARAM;
