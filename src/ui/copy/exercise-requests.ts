/** Verbatim strings from design/app/exercise-requests/spec.md copy inventory. */

export const BACK_TO_REQUEST = "Back to your request";
export const NEW_EXERCISE_REQUEST = "New exercise request";
export const CONFLICT_HEADING = "Someone submitted something similar";
export const CONFLICT_STATUS =
  "While you were adding this, someone submitted something similar. Your request isn't submitted yet. Use theirs, merge your changes into it, or submit yours anyway.";
export const YOUR_REQUEST = "Your request";
export const NOTE_PREFIX = "Note:";
export const SUBMITTED_WHILE_ADDING = "Submitted while you were adding";
export const TAG_DRAFT = "Draft";
export const AI_DRAFTING = "AI drafting";
export const MERGE_MY_CHANGES_HINT =
  "Merge my changes adds your name and note to their draft, so there's one request.";
export const MERGE_MY_CHANGES = "Merge my changes";
export const SUBMIT_ANYWAY = "Submit anyway";
export const BACK_TO_EDIT = "Back to edit";

export const REQUESTS_HEADING = "Requests and drafts";
export const REQUESTS_INTRO =
  "Requests in progress from every practitioner. Any practitioner can review a draft and approve it. Once approved, it leaves this list, joins the shared library and goes straight into the requester's My exercises.";
export const REQUESTS_SHARED_HINT =
  "Shared with all practitioners, so nobody requests the same exercise twice.";
export const REQUESTS_EMPTY =
  "Nothing in progress. Approved exercises are in the library.";
export const DRAFT_NOT_APPROVED = "Draft, not approved";
export const REQUESTED_BY = "Requested by";
export const REVIEW_DRAFT = "Review draft";
export const REVIEW_AND_APPROVE = "Review and approve";
export const USUALLY_READY = "Usually ready in a minute";
export const VIEW_DRAFT = "View draft";
export const VIEW_REQUEST = "View request";

export const TOAST_APPROVE_OWN =
  "Approved. It left Requests and drafts, and it is in your My exercises as new.";
export const TOAST_APPROVE_OTHER =
  "Approved. It left Requests and drafts. It is in All exercises, and in the requester's My exercises.";
export function toastUsingExisting(name: string): string {
  return `Using ${name}. Your request wasn't submitted.`;
}
export function toastMergedIntoDraft(name: string): string {
  return `Your changes were added to the ${name} draft. No new request.`;
}

export const REVIEW_BACK = "Requests";
export const APPROVE = "Approve";
export const REGENERATE = "Regenerate";
export const EDIT_ALL = "Edit all";
export const APPROVE_FOOTNOTE =
  "Approving records who approved it, the date and the version.";
export const APPROVE_FOOTNOTE_SHARED =
  "Approving records who approved it, the date and the version. Every practitioner sees who requested and who approved it.";
export const EXERCISE_DETAILS = "Exercise details";
export const BASICS = "Basics";
export const STARTING_POSITION = "Starting position";
export const IMAGES = "Images";
export const CHOOSE_IMAGE = "Choose image";
export const SWIPE_END = "Swipe to see the end position.";
export const AI_VIDEO_LOOP = "AI video, 6s loop";
export const GENERATING = "Generating";
export const REGENERATE_START_IMAGE = "Regenerate start image";
export const REGENERATE_END_IMAGE = "Regenerate end image";
export const REGENERATE_SHEET_TITLE = "Regenerate";
export const REGENERATE_ONE_IMAGE_HINT =
  "Only this image changes. The rest of the draft stays as it is.";
export const REGENERATE_CHOOSE_HINT =
  "Choose what the AI should redo. Your edits to anything else are kept.";
export const REGENERATE_THIS_IMAGE = "Regenerate this image";
export const REGENERATE_EVERYTHING = "Regenerate everything";
export const REGENERATE_IMAGES = "Regenerate images";
export const REGENERATE_VIDEO = "Regenerate video";
export const WHAT_TO_REGENERATE = "What to regenerate";
export const REGEN_NOTE_LABEL = "Note for the AI";
export const REGEN_NOTE_OPTIONAL = "(optional)";
export const REGEN_NOTE_PLACEHOLDER =
  "For example: show forearm support, not straight arm";
export const REGEN_UNDO_HINT = "You can undo afterwards. The previous version is kept.";
export const REGEN_SCOPE_ALL_LABEL = "Text, images and video";
export const REGEN_SCOPE_IMAGES_LABEL = "Images only";
export const REGEN_SCOPE_IMAGES_HINT = "Start and end images. Text and video stay.";
export const REGEN_SCOPE_VIDEO_LABEL = "The 6s loop";
export const REGEN_SCOPE_VIDEO_HINT = "Text and images stay.";
export const SAVE = "Save";
export const CANCEL = "Cancel";
export function editFieldLabel(label: string): string {
  return `Edit ${label}`;
}
export const REWRITTEN_BY_AI = "Rewritten by AI";

export const REGEN_DAILY_CAP = 5;
/** Referenced in design/app/exercise-library/spec.md copy inventory. */
export function regenLeftText(left: number): string {
  return `${left} of ${REGEN_DAILY_CAP} left today`;
}

/** Verbatim from design/app/exercise-library/spec.md copy inventory. */
export const DAILY_LIMIT_REACHED = "Daily limit reached.";

export const REGENERATING_EVERYTHING =
  "Regenerating everything. This takes about a minute.";
export function regeneratingScope(scopeLabel: string): string {
  return `Regenerating the ${scopeLabel}. Everything else stays usable.`;
}
