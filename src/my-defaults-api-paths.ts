import type { PrescriptionType } from "./domain/exercise-types.js";

/** Session-only My defaults API (DIDI-1006, CTO comment 152da896). */
export const MY_DEFAULTS_API_BASE = "/api/me/my-defaults";

export const LEGACY_PRACTITIONER_MY_DEFAULTS_PATH =
  /^\/api\/practitioners\/[^/]+\/my-defaults(?:\/|$)/;

export function myDefaultsShareLinkExpiryPath(): string {
  return `${MY_DEFAULTS_API_BASE}/share-link-expiry`;
}

export function myDefaultsTypePath(type: PrescriptionType): string {
  return `${MY_DEFAULTS_API_BASE}/types/${type}`;
}
