/** Placeholder D1 database_id in committed wrangler.jsonc (real id injected at deploy). */
export const D1_PLACEHOLDER_PRODUCTION = "00000000-0000-0000-0000-000000000001";

/** Placeholder WEB_APP_BASE_URL in committed wrangler.jsonc (production workers.dev URL at deploy). */
export const WEB_APP_BASE_URL_PLACEHOLDER =
  "https://00000000-0000-0000-0000-000000000002.invalid";

/** GitHub `production` environment variable (not a secret) for the Worker public https origin. */
export const PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV =
  "PHYSIO_PRODUCTION_WEB_APP_BASE_URL";

export const PHYSIO_D1_BINDING = "PHYSIO_DB";
export const PHYSIO_D1_DATABASE_NAME = "physio-poc";

export function isPlaceholderD1DatabaseId(id) {
  return id === D1_PLACEHOLDER_PRODUCTION;
}

export function looksLikeCommittedProductionD1Id(id) {
  if (typeof id !== "string" || id.length === 0) return false;
  if (isPlaceholderD1DatabaseId(id)) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
