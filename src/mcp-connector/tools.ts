import type { JsonSchema } from "./json-schema.js";
import {
  approvedExerciseSummarySchema,
  builderLinkOutputProperty,
  draftStateOutputProperty,
  exerciseCategorySchema,
  exerciseCountOutputProperty,
  expiresAtOutputProperty,
  hasNewerDraftOutputProperty,
  manageLinkOutputProperty,
  manageUrlOutputProperty,
  matchCountOutputProperty,
  nullableProgramTitleProperty,
  nullableProgramVersionRefSchema,
  paginationCursorInputProperty,
  paginationLimitProperty,
  paginationNextCursorOutputProperty,
  pdfUrlOutputProperty,
  prescriptionTypeSchema,
  programCodeProperty,
  programTitleProperty,
  publishLinkOutputProperty,
  routineIdProperty,
  routineSummarySchema,
  searchLinkOutputProperty,
  shareLinkOutputProperty,
  shareLinkStateOutputProperty,
  summaryOutputProperty,
} from "./json-schema.js";
import { FREE_TEXT_NO_PATIENT_DETAILS, MAX_LENGTH_QUERY } from "./text-limits.js";

export const MCP_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

export type PhysioMcpToolAnnotations = typeof MCP_TOOL_ANNOTATIONS;

export const SEARCH_APPROVED_EXERCISES_TOOL_NAME = "search_approved_exercises" as const;

export const searchApprovedExercisesDescription =
  "Search approved exercises visible to the connector (read-only). Only approved exercises are returned. Supports limit (default 10, max 25) and an opaque cursor; responses include next_cursor when more results exist. When the query matches nothing, exercises is empty and search_link is the prefilled web app search URL (built from server config). Do not pass patient information.";

export const searchApprovedExercisesInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: MAX_LENGTH_QUERY,
      description: `Search text (exercise name or keywords). ${FREE_TEXT_NO_PATIENT_DETAILS}`,
    },
    category: exerciseCategorySchema,
    body_region: {
      type: "string",
      description: "Single body region label from the seeded list.",
    },
    prescription_type: {
      ...prescriptionTypeSchema,
      description: "Optional filter: exercises that can be prescribed with this type.",
    },
    limit: paginationLimitProperty,
    cursor: paginationCursorInputProperty,
  },
};

export const searchApprovedExercisesOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "share_link", "manage_url", "exercises", "match_count"],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    manage_url: manageUrlOutputProperty,
    match_count: matchCountOutputProperty,
    exercises: {
      type: "array",
      items: approvedExerciseSummarySchema,
      description: "Matching approved exercises, empty when none match.",
    },
    next_cursor: paginationNextCursorOutputProperty,
    search_link: searchLinkOutputProperty,
  },
  allOf: [
    {
      if: {
        properties: {
          exercises: { type: "array", maxItems: 0 },
        },
        required: ["exercises"],
      },
      then: {
        required: ["search_link"],
      },
    },
  ],
};

export const SEARCH_ROUTINES_TOOL_NAME = "search_routines" as const;

export const searchRoutinesDescription =
  "Search routines (read-only): cookie-cutter programs for common ailments. Includes community library entries and personal copies. Supports limit (default 10, max 25) and an opaque cursor. Do not pass patient information.";

export const searchRoutinesInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: MAX_LENGTH_QUERY,
      description: `Search text (routine name or keywords). ${FREE_TEXT_NO_PATIENT_DETAILS}`,
    },
    limit: paginationLimitProperty,
    cursor: paginationCursorInputProperty,
  },
};

export const searchRoutinesOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "share_link", "manage_url", "routines"],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    manage_url: manageUrlOutputProperty,
    routines: {
      type: "array",
      items: routineSummarySchema,
      description: "Matching routines, empty when none match.",
    },
    next_cursor: paginationNextCursorOutputProperty,
  },
};

export const GET_PROGRAM_BUILDER_LINK_TOOL_NAME = "get_program_builder_link" as const;

export const getProgramBuilderLinkDescription =
  "Read-only deep link to the program builder in the web app. Pass program_code to open that program, or from_routine_id (UUID v4 opaque id) to start a new program from that routine, or omit both for a new blank program. When both program_code and from_routine_id are given, program_code wins and from_routine_id is ignored. No rows are passed in the link. Publishing and share links use get_program_share_link_or_pdf. Do not pass patient information.";

export const getProgramBuilderLinkInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    program_code: programCodeProperty,
    from_routine_id: {
      ...routineIdProperty,
      description:
        "When creating a new program, open the builder seeded from this routine id.",
    },
  },
};

export const getProgramBuilderLinkOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "share_link", "builder_link"],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    builder_link: builderLinkOutputProperty,
    manage_url: manageUrlOutputProperty,
    program_code: programCodeProperty,
    program_title: nullableProgramTitleProperty,
    exercise_count: exerciseCountOutputProperty,
    from_routine_id: routineIdProperty,
  },
};

export const GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME =
  "get_program_share_link_or_pdf" as const;

export const getProgramShareLinkOrPdfDescription =
  "Read-only program share link and PDF lookup. Provide program_code or program_title. Never publishes. When a published version exists, returns share_link, pdf_url, and expires_at when live, plus share_link_state. When only a draft exists, publish_link opens the publish page and draft_state is draft_only. When both draft and published exist, draft_state is published_with_draft_changes and has_newer_draft is true. manage_link opens the share page for expiry, close link, and delete. Lookup by program_title works only when exactly one program matches; otherwise the tool returns error_code ambiguous_title with candidates. Do not pass patient information.";

export const getProgramShareLinkOrPdfInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    program_code: programCodeProperty,
    program_title: programTitleProperty,
  },
};

export const getProgramShareLinkOrPdfOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "share_link",
    "manage_url",
    "pdf_url",
    "publish_link",
    "manage_link",
    "draft",
    "published",
    "draft_state",
    "has_newer_draft",
    "share_link_state",
  ],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    pdf_url: pdfUrlOutputProperty,
    manage_url: manageUrlOutputProperty,
    publish_link: publishLinkOutputProperty,
    manage_link: manageLinkOutputProperty,
    expires_at: expiresAtOutputProperty,
    draft: nullableProgramVersionRefSchema,
    published: nullableProgramVersionRefSchema,
    draft_state: draftStateOutputProperty,
    has_newer_draft: hasNewerDraftOutputProperty,
    share_link_state: shareLinkStateOutputProperty,
    program_code: programCodeProperty,
    program_title: nullableProgramTitleProperty,
  },
};
