/**
 * Documented fields on MCP tool success payloads (data contract, not user-facing copy).
 * JSON Schema in tools.ts remains authoritative for validation.
 */

import type {
  GetProgramDisplayState,
  McpShareLinkState,
} from "./get-program-contract.js";

/** `search_approved_exercises` success payload fields beyond summary and exercises. */
export type SearchApprovedExercisesToolOutputFields = {
  /** Number of approved exercises in `exercises` for this page. */
  match_count: number;
};

/** Structured MCP error when `from_routine_id` does not resolve for the owner (missing or cross-owner). */
export type GetProgramBuilderLinkRoutineNotFoundError = {
  error_code: "routine_not_found";
};

/** V1: owner-published routine resolves, but the web app cannot start a program from routine yet (DIDI-853). */
export type GetProgramBuilderLinkNotSupportedV1Error = {
  error_code: "not_supported_v1";
};

/** `get_program_builder_link` success payload when `program_code` resolved to a stored program. */
export type GetProgramBuilderLinkToolOutputFields = {
  /** Program display title when set; null when the draft has no name. */
  program_title: string | null;
  /** Count of exercises on the program draft. */
  exercise_count: number;
};

/** `get_program_share_link_or_pdf` structured publish/link state (not summary prose). */
export type GetProgramShareLinkOrPdfToolOutputFields = {
  /** Whether the program is draft-only, published only, or published with newer draft changes. */
  draft_state: GetProgramDisplayState;
  /** True when a published version exists and the saved draft is newer than what patients see. */
  has_newer_draft: boolean;
  /** Whether the program's share link is live, closed, expired, or absent. */
  share_link_state: McpShareLinkState;
  /** Program display title when set; null when the draft has no name. */
  program_title: string | null;
};
