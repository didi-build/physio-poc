/**
 * Contract rules for get_program_share_link_or_pdf (runtime-neutral).
 */

export type ProgramVersionRef = {
  readonly version: number;
  readonly updated_at: string;
};

export type GetProgramDisplayState =
  "draft_only" | "published_only" | "published_with_draft_changes";

export type McpShareLinkState = "live" | "closed" | "expired" | "none";

export function computeMcpShareLinkState(input: {
  latestLink: { closed_at: string | null; expires_at: string | null } | null;
  openShareLink: boolean;
  requestTimeIso: string;
}): McpShareLinkState {
  if (!input.latestLink) {
    return "none";
  }
  if (input.openShareLink) {
    return "live";
  }
  if (input.latestLink.closed_at !== null) {
    return "closed";
  }
  if (input.latestLink.expires_at !== null) {
    const expiresMs = Date.parse(input.latestLink.expires_at);
    const requestMs = Date.parse(input.requestTimeIso);
    if (
      !Number.isNaN(expiresMs) &&
      !Number.isNaN(requestMs) &&
      expiresMs <= requestMs
    ) {
      return "expired";
    }
  }
  return "none";
}

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
