import { removeRowAriaLabel } from "../copy/programs.js";

export function nextRemoveButtonIndex(
  removedIndex: number,
  remainingCount: number,
): number {
  return Math.min(removedIndex, Math.max(remainingCount - 1, 0));
}

export function focusRemoveButtonInNotice(
  noticeRoot: HTMLElement | null,
  title: string,
): void {
  const next = noticeRoot?.querySelector<HTMLButtonElement>(
    `[aria-label="${removeRowAriaLabel(title)}"]`,
  );
  next?.focus();
}

/** Focus "Review draft" on the placeholder row with the given exercise title (DIDI-1186). */
export function focusPlaceholderReviewDraftInNotice(
  noticeRoot: HTMLElement | null,
  title: string,
): void {
  if (!noticeRoot) {
    return;
  }
  for (const row of noticeRoot.querySelectorAll("li.pg-placeholder-row")) {
    const name = row.querySelector(".pg-placeholder-name");
    if (name?.textContent?.trim() === title) {
      row.querySelector<HTMLAnchorElement>("a.pg-link-btn")?.focus();
      return;
    }
  }
}
