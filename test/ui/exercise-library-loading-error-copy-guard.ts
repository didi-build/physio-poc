import { ACCOUNT_DISPLAY_NAME } from "../../src/ui/copy/a11y.js";
import {
  BACK_LIBRARY,
  EXERCISE_DETAILS,
  FILTERS_HEADER,
  LIB_HEADING,
  LIB_MY_DESCRIPTION,
  LIB_TAB_ALL,
  LIB_TAB_MY,
  MY_COPY,
  SEARCH_LABEL,
  SEARCH_ALL_PLACEHOLDER,
  SEARCH_MY_PLACEHOLDER,
  CLEAR,
  allExercisesIntro,
} from "../../src/ui/copy/exercise-library.js";
import {
  ACCOUNT_MY_DEFAULTS,
  ACCOUNT_MY_DEFAULTS_DETAIL,
  ACCOUNT_SIGN_OUT,
  ACCOUNT_SIGNED_IN_LINE,
  NAV_TAB_EXERCISES,
  NAV_TAB_PROGRAMS,
  NAV_TAB_REQUESTS_DESKTOP,
  NAV_TAB_REQUESTS_PHONE,
  NAV_TAB_ROUTINES,
  TOAST_UNDO,
} from "../../src/ui/copy/nav.js";
import {
  DEFAULT_FILTERS,
  filterSummary,
} from "../../src/ui/exercise-library/library-filters.js";
import { UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS } from "./exercise-library-unsourced-guard.js";

export const LOADING_ERROR_REGION_TEST_IDS = [
  "exercise-library-busy-skeleton",
  "exercise-library-list-error-slot",
  "exercise-library-detail-error-slot",
] as const;

/** Allowed visible text inside loading/error slot elements when copy slots are undefined. */
export const LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED: readonly string[] =
  [];

function physioShellAllowlist(): readonly string[] {
  return [
    NAV_TAB_EXERCISES,
    NAV_TAB_ROUTINES,
    NAV_TAB_PROGRAMS,
    NAV_TAB_REQUESTS_DESKTOP,
    NAV_TAB_REQUESTS_PHONE,
    ACCOUNT_DISPLAY_NAME,
    ACCOUNT_SIGNED_IN_LINE,
    ACCOUNT_MY_DEFAULTS,
    ACCOUNT_MY_DEFAULTS_DETAIL,
    ACCOUNT_SIGN_OUT,
    TOAST_UNDO,
    "Account menu",
    "D",
    "K",
  ];
}

/** Sourced strings that may appear on the library list page after a load error (My tab). */
export function exerciseLibraryListErrorPageAllowlistMine(): readonly string[] {
  return [
    ...physioShellAllowlist(),
    BACK_LIBRARY,
    LIB_HEADING,
    LIB_TAB_MY,
    LIB_TAB_ALL,
    LIB_MY_DESCRIPTION,
    SEARCH_LABEL,
    SEARCH_MY_PLACEHOLDER,
    CLEAR,
    FILTERS_HEADER,
    filterSummary(DEFAULT_FILTERS),
  ];
}

/** Sourced strings that may appear on the library list page after a load error (All tab with query). */
export function exerciseLibraryListErrorPageAllowlistAll(): readonly string[] {
  return [
    ...physioShellAllowlist(),
    BACK_LIBRARY,
    LIB_HEADING,
    LIB_TAB_MY,
    LIB_TAB_ALL,
    allExercisesIntro(0),
    SEARCH_LABEL,
    SEARCH_ALL_PLACEHOLDER,
    CLEAR,
    FILTERS_HEADER,
    filterSummary(DEFAULT_FILTERS),
  ];
}

/** Sourced strings that may appear on exercise details after a load error. */
export function exerciseLibraryDetailsErrorPageAllowlist(): readonly string[] {
  return [...physioShellAllowlist(), BACK_LIBRARY, EXERCISE_DETAILS, TOAST_UNDO];
}

/** Sourced strings that may appear on My copy editor after a load error. */
export function exerciseLibraryMyCopyErrorPageAllowlist(): readonly string[] {
  return [...physioShellAllowlist(), BACK_LIBRARY, MY_COPY, TOAST_UNDO];
}

export function stripAllowlistedPhrases(
  text: string,
  allowlist: readonly string[],
): string {
  let remainder = text.replace(/\s+/g, " ").trim();
  const sorted = [...allowlist].sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    if (phrase.length === 0) {
      continue;
    }
    remainder = remainder.split(phrase).join("");
  }
  return remainder.replace(/\s+/g, "").trim();
}

export function assertPageTextOnlyFromAllowlist(
  root: HTMLElement,
  allowlist: readonly string[],
): void {
  const remainder = stripAllowlistedPhrases(root.textContent ?? "", allowlist);
  if (remainder.length > 0) {
    throw new Error(`Non-allowlisted text on page: "${remainder}"`);
  }
}

export function assertExerciseLibraryErrorPageCopy(
  root: HTMLElement,
  allowlist: readonly string[],
): void {
  assertPageTextOnlyFromAllowlist(root, allowlist);
  for (const phrase of UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS) {
    if ((root.textContent ?? "").includes(phrase)) {
      throw new Error(`Unsourced phrase on page: "${phrase}"`);
    }
  }
  if ((root.textContent ?? "").includes("undefined")) {
    throw new Error('Literal "undefined" must not appear on the page');
  }
  if ((root.textContent ?? "").includes("Something went wrong")) {
    throw new Error("Invented error copy must not appear on the page");
  }
}

export function textInLoadingErrorRegions(root: ParentNode): string {
  const chunks: string[] = [];
  for (const testId of LOADING_ERROR_REGION_TEST_IDS) {
    const node = root.querySelector(`[data-testid="${testId}"]`);
    if (node) {
      chunks.push(node.textContent ?? "");
    }
  }
  return chunks.join("").trim();
}

export function assertLoadingErrorRegionsOnlyAllowlisted(
  root: ParentNode,
  allowlist: readonly string[],
): void {
  const text = textInLoadingErrorRegions(root);
  if (text.length === 0) {
    return;
  }
  if (!allowlist.includes(text)) {
    throw new Error(`Unexpected loading/error region text: "${text}"`);
  }
}

export function assertUnsourcedGuardListNonEmpty(
  list: readonly string[] = UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS,
): void {
  if (list.length === 0) {
    throw new Error("Unsourced guard list must not be empty");
  }
}
