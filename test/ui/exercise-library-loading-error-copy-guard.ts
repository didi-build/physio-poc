import { UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS } from "./exercise-library-unsourced-guard.js";

export const LOADING_ERROR_REGION_TEST_IDS = [
  "exercise-library-busy-skeleton",
  "exercise-library-list-error-slot",
  "exercise-library-detail-error-slot",
] as const;

/** Allowed visible text inside loading/error regions when copy slots are undefined. */
export const LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED: readonly string[] =
  [];

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

export function assertUnsourcedGuardListNonEmpty(): void {
  const phrases: readonly string[] = UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS;
  if (phrases.length === 0) {
    throw new Error("Unsourced guard list must not be empty");
  }
}
