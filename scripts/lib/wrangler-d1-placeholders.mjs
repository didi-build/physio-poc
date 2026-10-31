/** Placeholder D1 database_id in committed wrangler.jsonc (real id injected at deploy). */
export const D1_PLACEHOLDER_PRODUCTION = "00000000-0000-0000-0000-000000000001";

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
