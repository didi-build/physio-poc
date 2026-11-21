/** Verbatim strings from design/app/program-type-mismatch/spec.md copy table (DIDI-1105). */

export const TYPE_MISMATCH_DIDNT_LINK_BADGE = "Didn't link";

export function typeMismatchRowTypeLine(typeLabel: string): string {
  return `Row type: ${typeLabel}`;
}

export const TYPE_MISMATCH_REASON_STRENGTHENING_APPROVED =
  "Approved as strengthening. Change the type to link it.";

export const TYPE_MISMATCH_REASON_STRETCHING_APPROVED =
  "Approved as stretching. Change the type to link it.";

export const TYPE_MISMATCH_FIX = "Fix";

export const TYPE_MISMATCH_BANNER_ONE = "1 exercise didn't link";

export function typeMismatchBannerMany(count: number): string {
  return `${count} exercises didn't link`;
}

export const TYPE_MISMATCH_SHOW_ME = "Show me";

export const TYPE_MISMATCH_HINT_ISOMETRIC = "Hold still under load";
export const TYPE_MISMATCH_HINT_CONCENTRIC = "Lift or push with control";
export const TYPE_MISMATCH_HINT_ECCENTRIC = "Lower slowly";

export const TYPE_MISMATCH_PICK_ANOTHER_EXERCISE = "Pick another exercise";

export function typeMismatchLinkedToast(exercise: string, typeLabel: string): string {
  return `Linked ${exercise} as ${typeLabel}.`;
}

export const TYPE_MISMATCH_UNDO = "Undo";

/** Designer pick DIDI-1106 comment 1198f8fb (failed Undo after link). */
export const TYPE_MISMATCH_UNDO_LINK_FAILURE = "Couldn't undo the link. Try again.";

export const TYPE_MISMATCH_CARD_FLAG_ONE = "1 exercise didn't link";

export function typeMismatchCardFlagMany(count: number): string {
  return `${count} exercises didn't link`;
}

export function typeMismatchShowMeAriaLabel(): string {
  return "Show me exercises that didn't link";
}

export function typeMismatchLinkTypeAriaLabel(
  exercise: string,
  typeLabel: string,
): string {
  return `Link ${exercise} as ${typeLabel}`;
}

export const TYPE_MISMATCH_PUBLISH_NOTICE_T18 =
  "Fix or remove the exercises that didn't link.";

export const TYPE_MISMATCH_PUBLISH_NOTICE_T19 =
  "Fix or remove the exercises that didn't link, then publish.";

export function typeMismatchPublishFixAriaLabel(name: string): string {
  return `Fix for ${name}`;
}

export function typeMismatchCardFlag(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  if (count === 1) {
    return TYPE_MISMATCH_CARD_FLAG_ONE;
  }
  return typeMismatchCardFlagMany(count);
}
