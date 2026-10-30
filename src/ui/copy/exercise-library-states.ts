/**
 * Loading and error copy for exercise library screens.
 * Undefined slots render nothing until Diadem supplies wording.
 */

export const EXERCISE_LIBRARY_LIST_ERROR_MESSAGE: string | undefined = undefined;

export const EXERCISE_LIBRARY_DETAIL_ERROR_MESSAGE: string | undefined = undefined;

/** Unsourced strings that must never appear in UI until copy is approved. */
export const UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS = [
  "Failed to load exercises",
  "Failed to load exercise",
  "Loading…",
  "Loading...",
] as const;
