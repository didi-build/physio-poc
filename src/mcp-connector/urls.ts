/**
 * Web app URL paths for connector helpers (runtime-neutral).
 * physio-poc#1 does not define an exercise search route; this constant is the contract default.
 */

export const WEB_APP_EXERCISE_SEARCH_PATH = "/exercises/search";

export const WEB_APP_EXERCISE_SEARCH_QUERY_PARAM = "q";

export function normalizeWebAppBaseUrl(webAppBaseUrl: string): string {
  let base = webAppBaseUrl;
  while (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

/**
 * Build a web app exercise search URL. The base URL comes from server configuration, not tool input.
 */
export function buildWebAppExerciseSearchUrl(
  webAppBaseUrl: string,
  exerciseName: string,
): string {
  const base = normalizeWebAppBaseUrl(webAppBaseUrl);
  const params = new URLSearchParams();
  params.set(WEB_APP_EXERCISE_SEARCH_QUERY_PARAM, exerciseName);
  return `${base}${WEB_APP_EXERCISE_SEARCH_PATH}?${params.toString()}`;
}
