/** Verbatim strings from design/app/settings-link-expiry/spec.md (Copy inventory). */

export const PROGRAMS = "Programs";
export const MY_DEFAULTS_PAGE_TITLE = "My defaults";
export const MY_DEFAULTS_INTRO =
  "Your defaults fill in new program rows and new share links. Where you haven't set one, the global default is used. Edits on a single exercise in My exercises win over both.";

export const SHARE_LINK_EXPIRY_SECTION = "Share link expiry";
export const SHARE_LINK_EXPIRY_HINT =
  "New share links use this. You can change it on each program.";
export const DEFAULT_SHARE_LINK_EXPIRY_LABEL = "Default share link expiry";
export const NEVER_EXPIRY_HINT = "Never means a link works until you close it.";
export const GLOBAL_DEFAULT_ONE_YEAR = "Global default: 1 year.";
export const EXISTING_LINKS_NOTE =
  "Existing links keep their own setting. To end a link on a specific date, use Pick a date on that program's Share screen.";

export const YOUR_DEFAULT_BADGE = "Your default";
export const NEW_LINKS_NEVER_EXPIRE = "New links will never expire";
/** design/app/settings-link-expiry/spec.md States table, Changed default row (1 week example). */
export const NEW_LINKS_EXPIRE_AFTER_ONE_WEEK = "New links will expire after 1 week";

export const EXERCISE_TYPES_HEADING = "Exercise types";
export const EXERCISE_TYPES_BANNER =
  "Changing your defaults only affects exercises you add from now on. Existing programs and share links stay the same.";
export const GLOBAL_DEFAULT_IN_USE = "Global default, in use";
export const YOUR_DEFAULT_HEADING = "Your default";
export const GLOBAL_PREFIX = "Global:";
export const RESET_TO_GLOBAL = "Reset to global";
export const READS_AS = "Reads as:";
export const SAVE = "Save";
export const CANCEL = "Cancel";
export const ADD_PARAMETER = "Add parameter";
export const TYPE_DEFAULTS_FOOTNOTE =
  'Global defaults are set for all practitioners. Up, down and rest can be added with "Add parameter".';

export function editYourTypeDefaultLabel(typeLabel: string): string {
  return `Edit your ${typeLabel} default`;
}

export function setYourOwnTypeDefaultLabel(typeLabel: string): string {
  return `Set your own ${typeLabel} default`;
}

export function savedYourTypeDefaultToast(typeLabel: string): string {
  return `Saved your ${typeLabel} default`;
}

/** Prescription type titles shown on mockups 01 and 02 (not parameterized in spec copy). */
export const TYPE_LABELS = {
  stretching: "Stretching",
  isometric: "Isometric",
  concentric: "Concentric",
  eccentric: "Eccentric",
} as const;

export const SHARE_LINK_EXPIRY_CHOICE_LABELS = {
  "1_week": "1 week",
  "30_days": "30 days",
  "90_days": "90 days",
  "1_year": "1 year",
  never: "Never",
} as const;
