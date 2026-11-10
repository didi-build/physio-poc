/** Verbatim strings from design/app/programs/spec.md (publish, share, close link). */

import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { SHARE_LINK_EXPIRY_CHOICE_LABELS } from "./my-defaults.js";
import { formatProgramPublishedAt } from "./programs.js";
import { PROGRAM_PUBLISH_NAME_REQUIRED } from "../../copy/programs-share.js";

export { PROGRAM_PUBLISH_NAME_REQUIRED };

export const PUBLISH_SHEET_TITLE = "Publish to the live link?";
export const PUBLISH_NOW = "Publish now";
export const PUBLISH_NOT_YET = "Not yet";
export const PUBLISH_FIRST_PUBLISH_HEADING = "First publish";
export function publishChangesSinceHeading(publishedAt: string): string {
  return `Changes since ${formatProgramPublishedAt(publishedAt)}`;
}

export const PUBLISH_SHARE_LINK_HEADING = "Share link";
export const PUBLISH_NO_LINK_FIRST =
  "No link yet. Publishing creates it, ready to copy and send.";
export const PUBLISH_NO_OPEN_LINK =
  "There is no open link. Publishing creates a new one you can copy and send.";
export const PUBLISH_NO_LINK_YET_COPY = "No link yet...";
export const PUBLISH_COPY_LINK = "Copy";
export const PUBLISH_LINK_COPIED = "Link copied";
export const PUBLISH_NEW_LINK_HELPER = "Anyone with the new link sees this version.";
export const PUBLISH_SAME_LINK_HELPER =
  "Same link as before. Your patient sees this version as soon as you publish.";
export const PUBLISH_SHARE_SHEET_LINK_HELPER =
  "Your patient sees the published version on this link.";

export const LINK_EXPIRES_HEADING = "Link expires";
export const LINK_EXPIRES_PROGRAM_ONLY = "This program only";
export const LINK_STOPS_WORKING_ON = "Link stops working on";
export const PICK_A_DATE_HINT = "Any date from tomorrow. There is no latest date.";
export const EXPIRY_APPLIES_NEW_LINK = "Applies to the new link.";
export const EXPIRY_APPLIES_RIGHT_AWAY = "Expiry changes apply to the link right away.";
export const PICK_A_DATE_LABEL = "Pick a date";

export const PROGRAM_NAME_REQUIRED_LABEL = "Program name";
export const PROGRAM_NAME_REQUIRED_PAREN = "(required)";
export const PUBLISH_NAME_ROUTINE_HINT =
  "Filled in from the routine. Change it if you like.";
export const PUBLISH_DONE = "Done";

export const STICKY_PUBLISH_HEADING = "Publish";
export const STICKY_NOT_PUBLISHED_HELPER =
  "Not published yet. Publishing creates the share link to send.";
export const STICKY_NO_OPEN_LINK_HELPER =
  "There is no link yet. Publish to create one.";
export const STICKY_EVERYTHING_LIVE_PREFIX = "Everything is live.";
export const STICKY_LINK_SETTINGS = "Link settings";
export const STICKY_LINK_CLOSED = "Link closed";
export const SHARE_LINK_BUTTON = "Share link";

export const NO_SHARE_LINK_YET_BUILDER =
  "No share link yet. Publish when it is ready, and you get the link to send.";
export const NOT_LIVE_NO_OPEN_LINK =
  "Not live yet. There is no open link. Publish to create one.";
export const NO_OPEN_LINK_PUBLISH = "No open link. Publish to create one.";
export const PATIENT_SEES_ON_LINK = "Your patient sees this version on the share link.";
export const NOT_LIVE_STILL_PUBLISHED =
  "Not live yet. Your patient still sees the version published";

export function notLiveStillPublishedHelper(publishedAt: string): string {
  return `${NOT_LIVE_STILL_PUBLISHED} ${formatProgramPublishedAt(publishedAt)}.`;
}

export function keptAsDraftToast(code: string): string {
  return `Kept as a draft. Find it in Programs by name or code ${code}.`;
}

export const PUBLISHED_SAME_LINK_TOAST =
  "Published. Your patient sees it on the same link now.";
export const PUBLISHED_NEW_LINK_TOAST = "Published. Your new link is ready to send.";

export const TOAST_TITLE_CHANGED = "Title changed";
export const TOAST_EXERCISES_REORDERED = "Exercises reordered";

export function toastAddedExercise(name: string): string {
  return `Added ${name}`;
}

export function toastRemovedExercise(name: string): string {
  return `Removed ${name}`;
}

export const PLACEHOLDER_BLOCK_HEADING = "Approve or remove placeholders to publish";

export function placeholderBlockBodyMany(count: number): string {
  return `${count} exercises are placeholders. Approve each draft or remove it from this program, then publish.`;
}

export const PLACEHOLDER_BLOCK_BODY_ONE =
  "One exercise is a placeholder. Approve each draft or remove it from this program, then publish.";

export const PLACEHOLDER_REVIEW_DRAFT = "Review draft";

export function placeholderReviewDraftFor(name: string): string {
  return `Review draft for ${name}`;
}

export function placeholderRemovedLive(name: string): string {
  return `Removed ${name} from this program.`;
}

export const PLACEHOLDER_NONE_LEFT = "No placeholders left. You can publish.";

export const SHARE_PROGRAM_TITLE = "Share program";
export const SHARE_LINK_SECTION = "Share link";
export const SHARE_CLOSED_SUBTITLE = "Link closed";

export const SHARE_SEE_LINK_PAGE = "See the link page";
export const SHARE_SEE_LINK_PAGE_HINT = "What your patient sees, with Save as PDF";
export const SHARE_DOWNLOAD_PDF = "Download PDF";
export const SHARE_DOWNLOAD_PDF_HINT = "The same PDF the link page makes";
export const SHARE_CLOSE_LINK = "Close link";
export const SHARE_CLOSE_LINK_HINT = "The program stays in Programs";

export const SHARE_HELPER_VIEW =
  "Anyone with the link can view the program and save it as a PDF. No sign-in, no patient details stored.";
export const SHARE_HELPER_PUBLISHED =
  "The link always shows your latest published version. Edits stay a draft until you publish them.";

export const SHARE_NEVER_CALLOUT_TITLE = "Never expires.";
export const SHARE_NEVER_CALLOUT_BODY =
  "Good for a general program you reuse. It works until you close it.";
export const SHARE_REUSE_CALLOUT = "Reusing this program with other patients?";
export const SHARE_REUSE_CALLOUT_BODY =
  "Set it to Never. Each program has one link at a time.";
export const SHARE_SET_TO_NEVER = "Set to Never";

export function shareExpiresOnLine(dateLabel: string, choiceLabel?: string): string {
  if (choiceLabel) {
    return `Expires on ${dateLabel} (${choiceLabel}).`;
  }
  return `Expires on ${dateLabel}.`;
}

export const SHARE_CHANGE_IN_DEFAULTS_PREFIX = "Your default is";
export const SHARE_CHANGE_IN_DEFAULTS_LINK = "Change it in My defaults";

export const SHARE_LINK_CLOSED_LINE =
  'Anyone who opens the old link sees a "This link was closed" page. The program stays in Programs, so you can reuse it with another patient.';
export const SHARE_CREATE_NEW_LINK = "Create a new link";

export const CLOSE_LINK_SHEET_TITLE = "Close this share link?";
export const CLOSE_LINK_CONFIRM = "Close link";
export const CLOSE_LINK_CANCEL = "Cancel";

export function closeLinkBodyBeforeDate(dateLabel: string): string {
  return `Anyone with the link loses access right away, before ${dateLabel}.`;
}

export const CLOSE_LINK_BODY_NEVER = "Anyone with the link loses access right away.";
export const CLOSE_LINK_KEEP_PROGRAM =
  "The program stays in Programs. You can reuse it with another patient and create a new link any time.";

export const PDF_PREVIEW_ARIA = "PDF preview";
export const PDF_PREVIEW_EXERCISE_PROGRAM = "Exercise program";
export const PDF_PREVIEW_FOOTER =
  "Prepared by your physiotherapist. Watch the videos at the link on this page.";
export const PDF_PREVIEW_CAPTION = "PDF preview, page 1 of 1. Made from the link page.";

export const PHONE_LINK_PAGE = "Link page";
export const PHONE_SHARE = "Share";

export const LINK_PAGE_PREVIEW_HINT =
  "Preview of the link page. This is what anyone with the link sees, no sign-in.";

export const LINK_SET_NEVER_TOAST =
  "Link set to never expire. It works until you close it.";

export function linkNowExpiresToast(dateLabel: string): string {
  return `Link now expires ${dateLabel}`;
}

export function programCardMeta(code: string, exerciseCount: number): string {
  const countLabel = exerciseCount === 1 ? "1 exercise" : `${exerciseCount} exercises`;
  return `${code} · ${countLabel}`;
}

export function expiryChoiceLabel(expiresIn: ShareLinkExpiresIn): string {
  if (expiresIn === "custom_date") {
    return PICK_A_DATE_LABEL;
  }
  return SHARE_LINK_EXPIRY_CHOICE_LABELS[
    expiresIn as keyof typeof SHARE_LINK_EXPIRY_CHOICE_LABELS
  ];
}

export const EXPIRY_DEFAULT_MARK = "default";
