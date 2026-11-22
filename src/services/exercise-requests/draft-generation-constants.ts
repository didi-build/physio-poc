/** Locks not refreshed within this window are treated as stale (not in progress). */
export const DRAFT_GENERATION_LOCK_STALE_MS = 3 * 60 * 1000;

/** UI offers Try again / Delete when generation appears in progress longer than this. */
export const DRAFT_GENERATION_UI_ESCAPE_MS = 180_000;
