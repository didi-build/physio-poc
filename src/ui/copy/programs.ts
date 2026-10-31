/** Verbatim strings from design/app/programs/spec.md Copy inventory unless noted. */

export const PROGRAMS_PAGE_TITLE = "Programs";
export const PROGRAMS_INTRO =
  "Each program has a name you pick and a code. No patient details. Find one you already sent by name or code, and edit just that copy.";

export const PROGRAMS_EMPTY_HEADING = "No programs yet";
export const PROGRAMS_EMPTY_HELPER =
  "Start one from a routine or from scratch. You can find it here later by name or code.";

export const NEW_PROGRAM = "New program";
export const UNTITLED_PROGRAM = "Untitled program";

export const NOT_PUBLISHED_YET = "Not published yet";
export const DRAFT_CHANGES_NOT_PUBLISHED = "Draft changes not published";

export const SEARCH_PROGRAMS_LABEL = "Search programs by name or code";
export const SEARCH_BY_NAME_OR_CODE = "Search by name or code";
export const SEARCH_PROGRAMS_HELPER =
  "Search by the name you gave it or its code, like PRG-2M8D. Routine names work too.";
export const CLEAR_SEARCH = "Clear search";

export const FILTER_FROM_ROUTINE = "From a routine";
export const FILTER_FROM_SCRATCH = "From scratch";
export const FILTER_ALL_PROGRAMS = "Show programs";
/** design/app/programs/spec.md States table line 23 filter pills (All). */
export const FILTER_ALL_PILL = "All";

export const RECENTLY_DELETED = "Recently deleted";
export const RECENTLY_DELETED_INTRO =
  "Restore a deleted program for 30 days. After that it's gone for good. Its old share link stays closed.";
export const RECENTLY_DELETED_EMPTY = "No deleted programs.";
export const RESTORE = "Restore";

export const BUILT_FROM_SCRATCH = "Built from scratch";

export const CODE_CHIP_PREFIX = "Code";

export function programCodeChipLabel(code: string): string {
  return `${CODE_CHIP_PREFIX} ${code}`;
}

export const PROGRAM_NAME_LABEL = "Program name";
export const BUILDER_NAME_HELP =
  "Pick a name you will recognise. With the code {code}, it is how you find this program later. Don't use patient names or anything that identifies them.";

export function builderNameHelpText(code: string): string {
  return BUILDER_NAME_HELP.replace("{code}", code);
}

export const AUTO_SAVE_SAVING = "Saving...";
export const AUTO_SAVE_SAVED = "Saved";
export const AUTO_SAVE_NOT_SAVED = "Not saved";
export const AUTO_SAVE_FAILURE_HELPER = "Your latest changes aren't saved yet.";
export const AUTO_SAVE_FAILURE_ALERT =
  "Not saved. Your latest changes aren't saved yet.";
export const AUTO_SAVE_TRY_AGAIN = "Try again";
export const AUTO_SAVE_TRY_AGAIN_ARIA = "Try saving again";

export const LEAVE_TITLE = "Leave without saving?";
export const LEAVE_BODY =
  "Your latest changes aren't saved yet. If you leave now, you'll lose them.";
export const LEAVE_KEEP_EDITING = "Keep editing";
export const LEAVE_CONFIRM = "Leave";

export const BUILDER_UNPUBLISHED_CHANGES = "Unpublished changes";
export const BUILDER_PUBLISHED_PREFIX = "Published";

export const AUTO_SAVE_NOTE =
  "Changes save automatically. When you publish, your patient sees them on the same share link. No need to send a new one.";

export const DELETE_PROGRAM = "Delete program";
export const DELETE_PROGRAM_SHEET_TITLE = "Delete this program?";
export const DELETE_SHEET_MOVES_TO = "It moves to";
export const DELETE_SHEET_RESTORE_SUFFIX =
  ". You can restore it for 30 days, then it's gone for good.";
export const DELETE_SHEET_ALSO = "It also";
export const DELETE_SHEET_CLOSES_LINK = "closes its share link";
export const DELETE_SHEET_LINK_CLOSED_SUFFIX =
  ', so anyone who opens it sees "This link was closed".';
export const DELETE_SHEET_ALREADY_CLOSED = "Its share link is already closed.";
export const DELETE_SHEET_SHARE_HINT =
  "To stop sharing but keep the program, close the link on the Share screen instead.";

export function formatProgramPublishedAt(iso: string): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
}

export const ADD_EXERCISE = "Add exercise";
export const EXERCISES_SECTION = "Exercises";
export const BUILDER_ROWS_HINT =
  "Press and hold the dots to reorder. Use copy to add the same exercise again, for example in a second version.";
export const BUILDER_EMPTY_ROWS =
  "No exercises yet. Add exercises from My exercises or the full library.";

export const PLACEHOLDER_ROW_NOTE =
  "Placeholder. It links to the real exercise once you approve the draft.";

export const ROW_NOTES_LABEL = "Notes for this exercise (optional)";
export const ROW_DEFAULTS_FOOTNOTE =
  "Each row keeps the values it was added with. Changes to My exercises or My defaults apply to new rows only.";

export const PUBLISH = "Publish";

export const LIBRARY_UPDATE_KEEP = "Keep my original";
export const LIBRARY_UPDATE_BODY =
  "Programs aren't updated on their own. Update it, or keep your original.";

export function libraryUpdateTitle(exerciseName: string): string {
  return `Library update for ${exerciseName}`;
}

export function libraryUpdateApplyLabel(versionNumber: number): string {
  return `Update to v${versionNumber}`;
}

export const NEW_PROGRAM_SHEET_TITLE = "New program";
export const NEW_PROGRAM_FROM_ROUTINE = "From a routine";
export const NEW_PROGRAM_FROM_SCRATCH = "From scratch";
export const NEW_PROGRAM_CHOOSER_INTRO = "Start from a routine, or from scratch";
export const NEW_PROGRAM_ROUTINE_BLURB =
  "Pick a ready-made routine for a common condition, then tweak it for this patient.";
export const NEW_PROGRAM_SCRATCH_BLURB =
  "An empty program for a patient who doesn't fit a routine. Add exercises one by one.";

export const ADD_EXERCISE_SHEET_INTRO = "Your exercises first, then the full library";
export const MY_EXERCISES = "My exercises";
export const ALL_EXERCISES = "All exercises";
export const SEARCH_EXERCISES = "Search exercises";
export const SEARCH_MY_FIRST = "Search, my exercises first";
export const SEARCH_FULL_LIBRARY = "Search the full library";
export const FROM_FULL_LIBRARY = "From the full library";
export const SEARCH_ALL_EXERCISES = "Search all exercises";

export const NO_APPROVED_MATCH =
  "No approved exercise matches. Request it from the Library.";
export const NOTHING_IN_MY_MATCHES = "Nothing in My exercises matches.";

export const CARD_NO_EXERCISES_YET = "No exercises yet";

export function cardExerciseCountLine(count: number): string {
  if (count === 0) {
    return CARD_NO_EXERCISES_YET;
  }
  if (count === 1) {
    return "1 exercise";
  }
  return `${count} exercises`;
}

export function listCountLabel(total: number, visible?: number): string | null {
  if (total === 0) {
    return null;
  }
  if (visible === undefined || visible === total) {
    if (total === 1) {
      return "1 program";
    }
    return `${total} programs`;
  }
  if (total === 1) {
    if (visible === 1) {
      return "1 of 1 program";
    }
    return "0 of 1 program";
  }
  if (visible === 1) {
    return `1 of ${total} programs`;
  }
  return `${visible} of ${total} programs`;
}

/** mockups/01 and 29 (approved copy, CTO 12c15756). */
export const LIBRARY_UPDATES_TO_REVIEW_SINGULAR = "1 library update to review";

/** design/app/programs/spec.md States table line 23 for counts 2+. */
export function libraryUpdatesToReviewFlag(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  if (count === 1) {
    return LIBRARY_UPDATES_TO_REVIEW_SINGULAR;
  }
  return `${count} library updates to review`;
}

export const ROW_VERSION_LABEL = "Version";
export const ROW_VERSION_PICKER_HINT =
  "Pick a version. You can switch it on the row later.";

export function programCardOriginLineText(
  origin: import("../../services/programs/types.js").ProgramRoutineOriginView | null,
): string {
  if (origin === null) {
    return BUILT_FROM_SCRATCH;
  }
  const base = `From routine ${origin.routine_name}, v${origin.routine_version_number}`;
  if (origin.used_as === "used_as_is") {
    return `${base}, used as is`;
  }
  return `${base}, then tweaked`;
}

export function versionOfRowLabel(rowName: string): string {
  return `Version of ${rowName}`;
}

/** States table line 24; mockup 04 search no match. */
export function programsSearchNoMatch(query: string): string {
  return `No program matches "${query.trim()}"`;
}

export function deletedProgramToast(title: string | null): string {
  const name = title?.trim() ? title.trim() : UNTITLED_PROGRAM;
  return `Deleted ${name}. Its share link is closed. Restore it within 30 days.`;
}

export function restoredProgramToast(title: string | null): string {
  const name = title?.trim() ? title.trim() : UNTITLED_PROGRAM;
  return `Restored ${name}. Its link stays closed. Create a new link from Share.`;
}

export function duplicatedRowToast(rowName: string): string {
  return `Duplicated ${rowName}. Switch the version on the copy if you need both.`;
}

export function reorderRowAriaLabel(rowName: string, position: number): string {
  return `Reorder ${rowName}, position ${position}. Press and hold, then drag. Or use the arrow keys.`;
}

export function duplicateRowAriaLabel(rowName: string): string {
  return `Duplicate ${rowName}`;
}

export function removeRowAriaLabel(rowName: string): string {
  return `Remove ${rowName}`;
}

export function addExerciseChoiceLabel(name: string): string {
  return `Add ${name}`;
}

export function builderPublishedStatus(publishedAt: string): string {
  return `${BUILDER_PUBLISHED_PREFIX} ${formatProgramPublishedAt(publishedAt)}`;
}

export function formatAutoSaveStatus(
  status: import("../../services/programs/types.js").ProgramAutoSaveStatus,
  publishedAt?: string,
): string {
  if (status.kind === "not_published_yet") {
    return NOT_PUBLISHED_YET;
  }
  if (status.kind === "unpublished_changes") {
    return BUILDER_UNPUBLISHED_CHANGES;
  }
  if (publishedAt) {
    return builderPublishedStatus(publishedAt);
  }
  return BUILDER_PUBLISHED_PREFIX;
}
