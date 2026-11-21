/** Verbatim strings from design/app/shared-load-states/spec.md */

export type LoadListToken =
  "exercises" | "routines" | "programs" | "requests and drafts" | "your defaults";

export type LoadItemToken = "exercise" | "routine" | "program" | "draft";

export const TRY_AGAIN = "Try again";
export const TRYING_AGAIN = "Trying again...";

export const REFRESH_FAILURE_PRIMARY =
  "Couldn't refresh. You're seeing what loaded earlier.";

export const LIST_LOAD_ERROR_SECONDARY = "Check your connection, then try again.";

export function loadingListVisible(list: LoadListToken): string {
  return `Loading ${list}...`;
}

export function loadingListStatus(list: LoadListToken): string {
  return `Loading ${list}`;
}

export function loadingItemStatus(item: LoadItemToken): string {
  return `Loading ${item}`;
}

export function listLoadErrorPrimary(list: LoadListToken): string {
  return `Couldn't load ${list}.`;
}

export function itemLoadErrorPrimary(item: LoadItemToken): string {
  return `Couldn't load this ${item}.`;
}

export function notFoundTitle(item: LoadItemToken): string {
  return `This ${item} isn't available.`;
}

export function failedSaveItem(item: LoadItemToken): string {
  return `Couldn't save the ${item}. Try again.`;
}

export function failedRemoveItem(item: LoadItemToken): string {
  return `Couldn't remove the ${item}. Try again.`;
}

export const FAILED_SWITCH_TO_LIBRARY =
  "Couldn't switch to the library version. Try again.";

export const FAILED_KEEP_YOUR_VERSION = "Couldn't keep your version. Try again.";

export const BACK_TO_EXERCISES = "Back to exercises";
export const BACK_TO_ROUTINES = "Back to routines";
export const BACK_TO_PROGRAMS = "Back to programs";
export const BACK_TO_REQUESTS_AND_DRAFTS = "Back to requests and drafts";
export const BACK_TO_YOUR_DEFAULTS = "Back to your defaults";

export const NOT_FOUND_HELPER_EXERCISE =
  "It may have been merged into another exercise.";

export const NOT_FOUND_HELPER_PROGRAM =
  "It may have been deleted. Deleted programs stay in Recently deleted for 30 days.";

export const NOT_FOUND_HELPER_DRAFT =
  "It may have been approved or discarded. Approved exercises are in My exercises.";

export const NOT_FOUND_HELPER_ROUTINE = "It may have been deleted.";

export function backToListLabel(list: LoadListToken): string {
  switch (list) {
    case "exercises":
      return BACK_TO_EXERCISES;
    case "routines":
      return BACK_TO_ROUTINES;
    case "programs":
      return BACK_TO_PROGRAMS;
    case "requests and drafts":
      return BACK_TO_REQUESTS_AND_DRAFTS;
    case "your defaults":
      return BACK_TO_YOUR_DEFAULTS;
  }
}

export function listTokenForSurface(
  surface: "exercises" | "routines" | "programs" | "requests" | "defaults",
): LoadListToken {
  switch (surface) {
    case "exercises":
      return "exercises";
    case "routines":
      return "routines";
    case "programs":
      return "programs";
    case "requests":
      return "requests and drafts";
    case "defaults":
      return "your defaults";
  }
}

export function itemTokenForSurface(
  surface: "exercises" | "routines" | "programs" | "requests",
): LoadItemToken {
  switch (surface) {
    case "exercises":
      return "exercise";
    case "routines":
      return "routine";
    case "programs":
      return "program";
    case "requests":
      return "draft";
  }
}

export function notFoundHelper(item: LoadItemToken): string {
  switch (item) {
    case "exercise":
      return NOT_FOUND_HELPER_EXERCISE;
    case "program":
      return NOT_FOUND_HELPER_PROGRAM;
    case "draft":
      return NOT_FOUND_HELPER_DRAFT;
    case "routine":
      return NOT_FOUND_HELPER_ROUTINE;
  }
}
