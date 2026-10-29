/**
 * Contract rules for get_program_share_link_or_pdf (runtime-neutral).
 */

export const GET_PROGRAM_NEVER_AUTO_PUBLISH = true as const;

/** Republishing replaces the live version at the same share link (DIDI-594). */
export const GET_PROGRAM_REPUBLISH_KEEPS_SHARE_LINK = true as const;

export type ProgramVersionRef = {
  readonly version: number;
  readonly updated_at: string;
};

export type GetProgramDisplayState =
  "draft_only" | "published_only" | "published_with_draft_changes";

export function inferGetProgramDisplayState(
  draft: ProgramVersionRef | null,
  published: ProgramVersionRef | null,
): GetProgramDisplayState {
  if (published === null) {
    return "draft_only";
  }
  if (draft === null) {
    return "published_only";
  }
  if (
    draft.version !== published.version ||
    draft.updated_at !== published.updated_at
  ) {
    return "published_with_draft_changes";
  }
  return "published_only";
}

export function publishedLinkFieldsPresent(
  published: ProgramVersionRef | null,
): boolean {
  return published !== null;
}
