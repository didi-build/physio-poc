/**
 * Verbatim connector copy from design/connector/claude-connector/spec.md (copy inventory).
 */

export const MCP_COPY_SEARCHED_EXERCISE_LIBRARY = "Searched exercise library";
export const MCP_COPY_NO_APPROVED_MATCH = "No approved match";
export const MCP_COPY_FOUND_PROGRAM_BY_CODE = "Found program by code";
export const MCP_COPY_NOT_LIVE_YET = "It isn't live yet.";
export const MCP_COPY_NOTHING_PUBLISHED = "Okay, nothing is published.";
export const MCP_COPY_DRAFT_NOT_LIVE_YET = "This isn't live yet.";
export const MCP_COPY_PUBLISHED = "Published.";

export function approvedExerciseSearchSummary(matchCount: number): string {
  if (matchCount === 0) {
    return `${MCP_COPY_SEARCHED_EXERCISE_LIBRARY}. ${MCP_COPY_NO_APPROVED_MATCH}`;
  }
  const noun = matchCount === 1 ? "approved match" : "approved matches";
  return `${MCP_COPY_SEARCHED_EXERCISE_LIBRARY}. ${matchCount} ${noun}.`;
}

export function foundProgramByCodeSummary(
  code: string,
  title: string | null,
  exerciseCount: number,
): string {
  const namePart = title && title.trim().length > 0 ? title.trim() : "Untitled program";
  const exercisePart =
    exerciseCount === 1 ? "1 exercise" : `${exerciseCount} exercises`;
  return `${MCP_COPY_FOUND_PROGRAM_BY_CODE}. ${code}, ${namePart}, ${exercisePart}.`;
}

export function programShareSummary(input: {
  displayState: "draft_only" | "published_only" | "published_with_draft_changes";
  programCode: string;
  programTitle: string | null;
  openShareLink: boolean;
}): string {
  const title =
    input.programTitle && input.programTitle.trim().length > 0
      ? input.programTitle.trim()
      : input.programCode;
  if (input.displayState === "draft_only") {
    return `${MCP_COPY_NOTHING_PUBLISHED} ${title} (${input.programCode}) is a draft. ${MCP_COPY_NOT_LIVE_YET}`;
  }
  if (input.displayState === "published_with_draft_changes") {
    const live = input.openShareLink
      ? `The live share link is still open for the published version.`
      : "";
    return `${MCP_COPY_DRAFT_NOT_LIVE_YET} ${title} (${input.programCode}) has a newer draft. ${live}`.trim();
  }
  if (input.openShareLink) {
    return `${MCP_COPY_PUBLISHED} ${title} (${input.programCode}) has a live share link.`;
  }
  return `${MCP_COPY_PUBLISHED} ${title} (${input.programCode}) is published, but the share link is not live.`;
}
