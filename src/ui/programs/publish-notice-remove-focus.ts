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
