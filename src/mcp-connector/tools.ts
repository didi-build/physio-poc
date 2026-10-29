import type { JsonSchema } from "./json-schema.js";
import {
  ambiguousProgramMatchSchema,
  approvedExerciseSummarySchema,
  exerciseCategorySchema,
  exerciseNotFoundSchema,
  expiresAtOutputProperty,
  manageUrlOutputProperty,
  nullableProgramVersionRefSchema,
  paginationCursorInputProperty,
  paginationLimitProperty,
  paginationNextCursorOutputProperty,
  pdfUrlOutputProperty,
  prescriptionTypeSchema,
  programCodeProperty,
  programRowInputSchema,
  programRowOutputSchema,
  programTitleProperty,
  publishOverridesInputSchema,
  routineSummarySchema,
  searchLinkOutputProperty,
  shareLinkOutputProperty,
  summaryOutputProperty,
} from "./json-schema.js";
import { FREE_TEXT_NO_PATIENT_DETAILS, MAX_LENGTH_QUERY } from "./text-limits.js";

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
  required: ["summary", "share_link", "manage_url", "exercises"],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    manage_url: manageUrlOutputProperty,
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
  "Search routines: cookie-cutter programs for common ailments. Includes community library entries and personal copies. Supports limit (default 10, max 25) and an opaque cursor. Do not pass patient information.";

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

export const BUILD_OR_EDIT_PROGRAM_TOOL_NAME = "build_or_edit_program" as const;

export const buildOrEditProgramDescription =
  "Create or replace a program. Omit program_code to create; pass program_code to replace that program's full rows list (no incremental ops). Create from a routine with from_routine_id in one call; optional rows replaces the copied rows. Records source_routine_id on the program. Each row uses exercise_version_id or exercise_name, not both; the server resolves names and omits unresolved rows (no placeholder rows). Unresolved names appear in exercises_not_found with up to three candidates and a prefilled web app search link (URL built from server config). Publishing and link expiry use get_program_share_link_or_pdf. Closing a link stays in the web app. Do not include patient information in program_title or row_notes.";

export const buildOrEditProgramInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    program_code: programCodeProperty,
    program_title: programTitleProperty,
    from_routine_id: {
      type: "string",
      description:
        "When creating a new program, copy rows from this routine id. Optional rows replaces the copy in the same call.",
    },
    rows: {
      type: "array",
      items: programRowInputSchema,
      description: "Full rows list that replaces the program contents on save.",
    },
  },
};

export const buildOrEditProgramOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "share_link",
    "manage_url",
    "program_code",
    "program_title",
    "rows",
  ],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    manage_url: manageUrlOutputProperty,
    program_code: programCodeProperty,
    program_title: programTitleProperty,
    source_routine_id: {
      type: "string",
      description: "Routine id when this program was created from a routine.",
    },
    rows: {
      type: "array",
      items: programRowOutputSchema,
    },
    exercises_not_found: {
      type: "array",
      items: exerciseNotFoundSchema,
      description:
        "Exercise names that were not resolved to exactly one approved exercise.",
    },
  },
};

export const GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME =
  "get_program_share_link_or_pdf" as const;

export const getProgramShareLinkOrPdfDescription =
  "Read or publish a program share link and PDF. Never publishes unless publish is true. Set publish to true only after the practitioner explicitly confirms in the conversation. Without publish, returns draft and published (each null or a version snapshot). When a published version exists, also returns its share_link, pdf_url, and expires_at; share_link and pdf_url are empty strings when nothing is published yet. The summary should ask which version the practitioner wants and whether to publish with defaults or overrides. With publish true, publishes the current draft and returns share_link, pdf_url, and expires_at (republishing replaces the live version at the same share link). Optional overrides.expires_in sets expiry (1_week, 30_days, 90_days, 1_year, never, or custom_date with overrides.custom_date); omit overrides to use the practitioner default. Lookup by program_code or program_title; title works only when exactly one program matches, otherwise ambiguous_program_matches is returned. Deleting a link is web app only.";

export const getProgramShareLinkOrPdfInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    program_code: programCodeProperty,
    program_title: programTitleProperty,
    publish: {
      type: "boolean",
      default: false,
      description:
        "When false, read only. When true, publish the current draft after explicit practitioner confirmation in chat.",
    },
    overrides: publishOverridesInputSchema,
  },
  anyOf: [{ required: ["program_code"] }, { required: ["program_title"] }],
};

export const getProgramShareLinkOrPdfOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "share_link", "manage_url", "pdf_url", "draft", "published"],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    pdf_url: pdfUrlOutputProperty,
    manage_url: manageUrlOutputProperty,
    expires_at: expiresAtOutputProperty,
    draft: nullableProgramVersionRefSchema,
    published: nullableProgramVersionRefSchema,
    program_code: programCodeProperty,
    program_title: programTitleProperty,
    ambiguous_program_matches: {
      type: "array",
      items: ambiguousProgramMatchSchema,
      description:
        "When program_title matches more than one program, list candidates and ask for program_code.",
    },
  },
};
