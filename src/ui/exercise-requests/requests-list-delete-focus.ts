export function focusAfterRequestsListDelete(input: {
  listRoot: HTMLElement | null;
  heading: HTMLElement | null;
  deletedIndex: number;
}): void {
  const rows = input.listRoot
    ? [
        ...input.listRoot.querySelectorAll<HTMLElement>(
          '[data-testid="ex-requests-row-focus"]',
        ),
      ]
    : [];
  if (rows.length === 0) {
    input.heading?.focus();
    return;
  }
  const targetIndex =
    input.deletedIndex >= rows.length
      ? rows.length - 1
      : Math.max(0, input.deletedIndex);
  const row = rows[targetIndex];
  if (!row) {
    input.heading?.focus();
    return;
  }
  const reviewLink = row.querySelector<HTMLElement>(
    '[data-testid^="ex-requests-review-"]',
  );
  if (reviewLink) {
    reviewLink.focus();
    return;
  }
  const deleteBtn = row.querySelector<HTMLButtonElement>(".ex-delete-draft-btn");
  if (deleteBtn && !deleteBtn.disabled) {
    deleteBtn.focus();
    return;
  }
  row.focus();
}
