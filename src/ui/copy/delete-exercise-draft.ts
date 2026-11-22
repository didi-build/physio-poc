/** Strings from design/app/delete-exercise-draft/spec.md (D1–D5, D7, D9–D12). */

export const DELETE_DRAFT = "Delete draft";

export function deleteDraftDialogTitle(title: string): string {
  return `Delete ${title}?`;
}

export const DELETE_DRAFT_DIALOG_BODY_OFF_LIST =
  "It comes off Requests and drafts for every practitioner.";

export const DELETE_DRAFT_DIALOG_BODY_NO_UNDO = "You can't undo this.";

export const DELETE_DRAFT_TOAST_SUCCESS = "Draft deleted. It left Requests and drafts.";

export const DELETE_DRAFT_BLOCKED_WHILE_GENERATING =
  "You can delete it once the AI finishes drafting.";

export function deleteDraftRowAriaLabel(title: string): string {
  return `Delete ${title}`;
}

export const DELETE_DRAFT_FAILED = "Couldn't delete the draft. Try again.";

export const DELETE_DRAFT_ALREADY_APPROVED =
  "This draft was approved, so it can no longer be deleted.";

export const DELETE_DRAFT_ALREADY_GONE =
  "This draft was deleted. It is no longer in Requests and drafts.";
