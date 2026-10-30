/** Verbatim strings from design/app/exercise-library/spec.md copy inventory. */

export const LIB_HEADING = "Exercise library";
export const LIB_TAB_MY = "My exercises";
export const LIB_TAB_ALL = "All exercises";
export const LIB_MY_DESCRIPTION =
  "Exercises you saved or used in a program. Pin your favourites to keep them on top.";

export const SEARCH_LABEL = "Search exercises";
export const SEARCH_MY_PLACEHOLDER = "Search my exercises";
export const SEARCH_ALL_PLACEHOLDER = "Try: heel slides, SLR, knee";
export const CLEAR = "Clear";

export const FILTERS_HEADER = "Filters & sort";
export const ALL_REGIONS = "All regions";
export const BODY_REGION = "Body region";
export const TYPE = "Type";
export const CLOSE_TYPE_LIST = "Close type list";
export const SORT = "Sort";
export const RESET = "Reset";
export const DONE = "Done";

export const TYPE_BOTH_LABEL = "Strengthening & stretching";
export const TYPE_BOTH_HINT = "Every exercise";
export const TYPE_STRENGTH_LABEL = "Strengthening";
export const TYPE_STRENGTH_HINT = "Isometric, concentric, eccentric";
export const TYPE_STRETCH_LABEL = "Stretching";
export const TYPE_STRETCH_HINT = "Hold a stretch";

export const SORT_MOST_USED = "Most used";
export const SORT_NEWEST = "Newest";
export const SORT_A_TO_Z = "A to Z";

export const TOAST_BOTH_TYPES = "Showing both types. At least one type stays on.";

export const SECTION_NEW_FROM_REQUESTS = "New from your requests";
export const SECTION_PINNED = "Pinned";
export const SECTION_RECENT = "Recently used and saved";
export const BROWSE_ALL = "Browse all exercises";

export const NO_SAVED_WITH_FILTERS = "No saved exercises with these filters";
export const NOTHING_IN_MY_MATCHES_PREFIX = "Nothing in My exercises matches";
export const TRY_ALL_OR_REQUEST = "Try All exercises, or request it there.";
export const SEARCH_ALL_EXERCISES = "Search all exercises";

export const MATCHED_ALIAS_PREFIX = "Matched alias:";
export const TAG_EDITED = "Edited";
export const TAG_LIBRARY_UPDATED = "Library updated";
export const TAG_NEW = "New";

export const USED_PREFIX = "Used";
export const SAVED_PREFIX = "Saved";

export const ALL_APPROVED_INTRO =
  "approved exercises, shared by every practitioner. Any practitioner can improve one, and every change is kept in version history.";

export const NO_EXACT_MATCH_PREFIX = "No exact match for";
export const SIMILAR_INTRO =
  "These look close. If one fits, use it instead of requesting a new one.";
export const NOT_IN_LIBRARY_YET = "It isn't in the library or in drafts yet.";
export const SIMILAR_SECTION = "Similar in the library and drafts";
export const IN_LIBRARY = "In library";
export const USE_THIS = "Use this";
export const USING_NO_REQUEST = "Using {name}. No request made.";

export const REQUEST_NONE_HEADING = "None of these? Request a new exercise";
export const REQUEST_HEADING = "Request a new exercise";
export const REQUEST_SUBTEXT =
  "The AI drafts it for any practitioner to review and approve.";
export const EXERCISE = "Exercise";
export const NOTE_FOR_AI = "Note for the AI";
export const OPTIONAL = "(optional)";
export const NOTE_PLACEHOLDER = "For example: rehab version, supine";
export const SUBMIT_REQUEST = "Submit request";
export const CONCEPT_DEMO_PREFIX = "Concept demo:";
export const CONCEPT_DEMO_TEXT =
  "another practitioner submits something similar while you fill this in.";

export const BACK_LIBRARY = "Library";
export const EXERCISE_DETAILS = "Exercise details";
export const SHARED_LIBRARY_ENTRY = "Shared library entry";
export const SHARED_LIBRARY_BLURB =
  "Any practitioner can improve it. Each save becomes the next version for everyone, and older versions can be restored.";
export const EDIT_FOR_EVERYONE = "Edit for everyone";
export const HISTORY = "History";
export const REPORT_DUPLICATE = "Report duplicate or merge";
export const IMAGES_AND_VIDEO = "Images and video";
export const START_POSITION = "Start position";
export const END_POSITION = "End position";
export const HOW_TO_DO_IT = "How to do it";
export const VERSIONS_HEADING = "Versions";
export const VERSION_HEADING = "Version";
export const STRENGTH_VERSIONS_INTRO =
  "Every strengthening exercise has all 3. You pick one on each program row.";
export const STRETCH_VERSION_INTRO = "Stretch exercises have one version, Stretching.";
export const CUE_PREFIX = "Cue:";
export const LIBRARY_DEFAULTS_LINE =
  "Library defaults, including suggested tempo and rest.";
export const ABOUT = "About this exercise";
export const ALSO_CALLED = "Also called";
export const EQUIPMENT = "Equipment";
export const BODY_REGIONS = "Body regions";
export const ADDED_BY = "Added by";
export const VERSION = "Version";
export const LAST_EDITED = "Last edited";
export const VISIBLE_TO = "Visible to";
export const ALL_PRACTITIONERS = "All practitioners";
export const WHO_CAN_EDIT = "Who can edit";
export const ANY_PRACTITIONER = "Any practitioner";
export const PRECAUTIONS = "Precautions";
export const PRECAUTIONS_FOOTER =
  "General guidance for this exercise. Not specific to any patient.";
export const MY_COPY = "My copy";
export const MY_COPY_DETAILS_BLURB =
  "Private changes only you see. To fix it for everyone, use Edit for everyone.";
export const NO_EDITS_YET = "No edits yet.";
export const SAVE_TO_EDIT =
  "Save it to edit the text and set your own defaults for this exercise.";
export const ADD_TO_MY = "Add to my exercises";
export const EDIT_MY_COPY = "Edit my copy";
export const IN_MY_EXERCISES = "In my exercises";
export const REMOVE = "Remove";
export const PROGRAM_HINT =
  "To use it in a program, open a program and tap Add exercise.";
export const LIVE_SUFFIX = "live";

export const MY_COPY_EDITOR_INTRO =
  "Your edits sit on top of the library exercise. Only you see them. Anything you haven't edited follows the library.";
export const MY_COPY_LIBRARY_HINT =
  "Something wrong for everyone? Edit the library entry";
export const MY_COPY_PROGRAMS_HINT =
  "Changes apply to new programs only. Programs you already built keep the values they were made with.";
export const TEXT_SECTION = "Text";
export const LIBRARY_CHANGED = "The library changed this after you edited it";
export const LIBRARY_NOW = "Library now:";
export const USE_LIBRARY_VERSION = "Use library version";
export const KEEP_MINE = "Keep mine";
export const REMOVE_FROM_MY = "Remove from My exercises";
export const SEE_LIBRARY_DETAILS = "See library details";

export const TOAST_SAVED_MY = "Saved to My exercises";
export function toastRemovedFromMy(name: string): string {
  return `Removed ${name} from My exercises`;
}

export const TITLE_FIELD = "Title";
export const DESCRIPTION_FIELD = "Description";

export function cueFieldLabel(typeLabel: string): string {
  return `Cue, ${typeLabel.toLowerCase()}`;
}

export function noExactMatchHeading(query: string): string {
  return `${NO_EXACT_MATCH_PREFIX} "${query}"`;
}

export function nothingInMyMatches(query: string): string {
  return `${NOTHING_IN_MY_MATCHES_PREFIX} "${query}"`;
}

export function usingExerciseToast(name: string): string {
  return USING_NO_REQUEST.replace("{name}", name);
}

export function allExercisesIntro(count: number): string {
  return `${count} ${ALL_APPROVED_INTRO}`;
}
