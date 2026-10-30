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

const SHELL_TEXT_EXCLUSION_SELECTORS = [
  '[data-testid="shell-brand-mark"]',
  '[data-testid="shell-account-avatar"]',
  ".sr-only",
] as const;

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
  ];
}

function shellSegmentLimits(): Readonly<Record<string, number>> {
  return {
    [NAV_TAB_EXERCISES]: 2,
    [NAV_TAB_ROUTINES]: 2,
    [NAV_TAB_PROGRAMS]: 2,
    [NAV_TAB_REQUESTS_DESKTOP]: 1,
    [NAV_TAB_REQUESTS_PHONE]: 1,
    [ACCOUNT_DISPLAY_NAME]: 1,
    [ACCOUNT_SIGNED_IN_LINE]: 1,
    [ACCOUNT_MY_DEFAULTS]: 1,
    [ACCOUNT_MY_DEFAULTS_DETAIL]: 1,
    [ACCOUNT_SIGN_OUT]: 1,
    [TOAST_UNDO]: 1,
  };
}

function mergeSegmentLimits(
  ...parts: Readonly<Record<string, number>>[]
): Readonly<Record<string, number>> {
  const merged: Record<string, number> = { ...shellSegmentLimits() };
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      merged[key] = value;
    }
  }
  return merged;
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

export function exerciseLibraryListErrorPageSegmentLimitsMine(): Readonly<
  Record<string, number>
> {
  return mergeSegmentLimits({
    [BACK_LIBRARY]: 1,
    [LIB_HEADING]: 1,
    [LIB_TAB_MY]: 1,
    [LIB_TAB_ALL]: 1,
    [LIB_MY_DESCRIPTION]: 1,
    [SEARCH_LABEL]: 1,
    [SEARCH_MY_PLACEHOLDER]: 1,
    [CLEAR]: 1,
    [FILTERS_HEADER]: 1,
    [filterSummary(DEFAULT_FILTERS)]: 1,
  });
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

export function exerciseLibraryListErrorPageSegmentLimitsAll(): Readonly<
  Record<string, number>
> {
  return mergeSegmentLimits({
    [BACK_LIBRARY]: 1,
    [LIB_HEADING]: 1,
    [LIB_TAB_MY]: 1,
    [LIB_TAB_ALL]: 1,
    [allExercisesIntro(0)]: 1,
    [SEARCH_LABEL]: 1,
    [SEARCH_ALL_PLACEHOLDER]: 1,
    [CLEAR]: 1,
    [FILTERS_HEADER]: 1,
    [filterSummary(DEFAULT_FILTERS)]: 1,
  });
}

/** Sourced strings that may appear on exercise details after a load error. */
export function exerciseLibraryDetailsErrorPageAllowlist(): readonly string[] {
  return [...physioShellAllowlist(), BACK_LIBRARY, EXERCISE_DETAILS, TOAST_UNDO];
}

export function exerciseLibraryDetailsErrorPageSegmentLimits(): Readonly<
  Record<string, number>
> {
  return mergeSegmentLimits({
    [BACK_LIBRARY]: 1,
    [EXERCISE_DETAILS]: 2,
  });
}

/** Sourced strings that may appear on My copy editor after a load error. */
export function exerciseLibraryMyCopyErrorPageAllowlist(): readonly string[] {
  return [...physioShellAllowlist(), BACK_LIBRARY, MY_COPY, TOAST_UNDO];
}

export function exerciseLibraryMyCopyErrorPageSegmentLimits(): Readonly<
  Record<string, number>
> {
  return mergeSegmentLimits({
    [BACK_LIBRARY]: 1,
    [MY_COPY]: 2,
  });
}

function isExcludedTextNode(textNode: Text): boolean {
  const parent = textNode.parentElement;
  if (!parent) {
    return true;
  }
  for (const selector of SHELL_TEXT_EXCLUSION_SELECTORS) {
    if (parent.closest(selector)) {
      return true;
    }
  }
  return false;
}

/** Visible text segments: one entry per non-empty text node (exact), excluding brand, avatar, sr-only. */
export function collectVisibleTextSegments(root: ParentNode): string[] {
  const segments: string[] = [];
  if (!(root instanceof HTMLElement || root instanceof Document)) {
    return segments;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && !isExcludedTextNode(current)) {
      const normalized = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (normalized.length > 0) {
        segments.push(normalized);
      }
    }
    current = walker.nextNode();
  }
  return segments;
}

function countSegments(segments: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const segment of segments) {
    counts.set(segment, (counts.get(segment) ?? 0) + 1);
  }
  return counts;
}

export function assertPageTextOnlyFromAllowlist(
  root: HTMLElement,
  allowlist: readonly string[],
  segmentLimits: Readonly<Record<string, number>>,
): void {
  const allowSet = new Set(allowlist);
  const segments = collectVisibleTextSegments(root);
  const counts = countSegments(segments);

  for (const segment of segments) {
    if (!allowSet.has(segment)) {
      throw new Error(`Non-allowlisted text segment: "${segment}"`);
    }
  }

  for (const [phrase, maxCount] of Object.entries(segmentLimits)) {
    const seen = counts.get(phrase) ?? 0;
    if (seen > maxCount) {
      throw new Error(
        `Too many "${phrase}" segments on page (expected at most ${maxCount}, saw ${seen})`,
      );
    }
  }
}

export function assertExerciseLibraryErrorPageCopy(
  root: HTMLElement,
  allowlist: readonly string[],
  segmentLimits: Readonly<Record<string, number>>,
): void {
  assertPageTextOnlyFromAllowlist(root, allowlist, segmentLimits);
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

export function assertShellBrandAndAvatarCopy(root: ParentNode): void {
  const brand = root.querySelector('[data-testid="shell-brand-mark"]');
  const avatar = root.querySelector('[data-testid="shell-account-avatar"]');
  if (!brand || brand.textContent?.trim() !== "D") {
    throw new Error("Expected shell brand mark text D");
  }
  if (!avatar || avatar.textContent?.trim() !== "K") {
    throw new Error("Expected shell account avatar text K");
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
