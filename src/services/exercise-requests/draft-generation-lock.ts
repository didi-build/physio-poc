import { DRAFT_GENERATION_LOCK_STALE_MS } from "./draft-generation-constants.js";

export { DRAFT_GENERATION_LOCK_STALE_MS };

export function isLockFresh(lockedAt: string | null, nowIso: string): boolean {
  if (!lockedAt) {
    return false;
  }
  const ageMs = Date.parse(nowIso) - Date.parse(lockedAt);
  return ageMs >= 0 && ageMs < DRAFT_GENERATION_LOCK_STALE_MS;
}
