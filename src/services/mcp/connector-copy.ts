/**
 * Verbatim connector copy from design/connector/claude-connector/spec.md (copy inventory).
 */

export const MCP_COPY_SEARCHED_EXERCISE_LIBRARY = "Searched exercise library";
export const MCP_COPY_NO_APPROVED_MATCH = "No approved match";
export const MCP_COPY_SEARCHED_ROUTINES = "Searched routines";
export const MCP_COPY_FOUND_PROGRAM_BY_CODE = "Found program by code";
export const MCP_COPY_CREATED_PROGRAM_FROM_ROUTINE = "Created program from routine";
export const MCP_COPY_NOT_LIVE_YET = "Not live yet";
export const MCP_COPY_NOTHING_PUBLISHED = "Okay, nothing is published.";
export const MCP_COPY_DRAFT_NOT_LIVE_YET = "This isn't live yet.";
export const MCP_COPY_PUBLISHED = "Published.";
export const MCP_COPY_IT_ISNT_LIVE_YET = "It isn't live yet.";

export function approvedExerciseSearchSummary(matchCount: number): string {
  return matchCount === 0
    ? MCP_COPY_NO_APPROVED_MATCH
    : MCP_COPY_SEARCHED_EXERCISE_LIBRARY;
}

export function foundProgramByCodeSummary(): string {
  return MCP_COPY_FOUND_PROGRAM_BY_CODE;
}

export function searchedRoutinesSummary(): string {
  return MCP_COPY_SEARCHED_ROUTINES;
}

export function createdProgramFromRoutineSummary(): string {
  return MCP_COPY_CREATED_PROGRAM_FROM_ROUTINE;
}

export function programShareSummary(input: {
  displayState: "draft_only" | "published_only" | "published_with_draft_changes";
  openShareLink: boolean;
}): string {
  if (input.displayState === "draft_only") {
    return MCP_COPY_NOTHING_PUBLISHED;
  }
  if (input.displayState === "published_with_draft_changes") {
    return MCP_COPY_DRAFT_NOT_LIVE_YET;
  }
  if (input.openShareLink) {
    return MCP_COPY_PUBLISHED;
  }
  return MCP_COPY_NOT_LIVE_YET;
}
