/** Verbatim strings from design/app/routines/spec.md Copy inventory unless noted. */

export const ROUTINES_PAGE_TITLE = "Routines";
export const ROUTINES_TAB_MY = "My routines";
export const ROUTINES_TAB_ALL = "All routines";

export const MY_ROUTINES_INTRO =
  "Routines you saved or started. A saved routine stays as it was when you saved it. When the community version changes, it is flagged so you can update.";

export function allRoutinesIntro(count: number): string {
  return `${count} ready-made programs for common conditions, shared by every practitioner. Anyone can add or improve one, and every change is kept in version history.`;
}

export const MY_ROUTINES_EMPTY_HEADING = "No routines saved yet";
export const MY_ROUTINES_EMPTY_HELPER = "Save one from All routines, or make your own.";

export const ALL_ROUTINES_EMPTY_HEADING = "No routine matches";
export const ALL_ROUTINES_EMPTY_HELPER =
  "Try a body region or an exercise name. Or add the routine yourself.";
