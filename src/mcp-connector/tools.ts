import type { JsonSchema } from "./json-schema.js";
import {
  approvedExerciseSummarySchema,
  exerciseCategorySchema,
  exerciseNotFoundSchema,
  programCodeProperty,
  programRowSchema,
  programTitleProperty,
  routineSummarySchema,
  shareLinkOutputProperty,
  summaryOutputProperty,
  toolResponseBaseSchema,
  webAppBaseUrlProperty,
} from "./json-schema.js";

export const SEARCH_APPROVED_EXERCISES_TOOL_NAME = "search_approved_exercises" as const;

export const searchApprovedExercisesDescription =
  "Search approved exercises visible to the connector (read-only). Only approved exercises are returned. Do not pass patient information. Use category Stretching or Strengthening and optional body region labels from the seeded list to narrow results.";

export const searchApprovedExercisesInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description: "Search text (exercise name or keywords).",
    },
    category: exerciseCategorySchema,
    body_region: {
      type: "string",
      description: "Single body region label from the seeded list.",
    },
    prescription_type: {
      type: "string",
      enum: ["stretching", "isometric", "concentric", "eccentric"],
      description: "Optional filter: exercises that can be prescribed with this type.",
    },
  },
};

export const searchApprovedExercisesOutputSchema: JsonSchema = {
  allOf: [
    toolResponseBaseSchema,
    {
      type: "object",
      additionalProperties: false,
      required: ["exercises"],
      properties: {
        summary: summaryOutputProperty,
        share_link: shareLinkOutputProperty,
        exercises: {
          type: "array",
          items: approvedExerciseSummarySchema,
          description: "Matching approved exercises, empty when none match.",
        },
      },
    },
  ],
};

export const SEARCH_ROUTINES_TOOL_NAME = "search_routines" as const;

export const searchRoutinesDescription =
  "Search routines: cookie-cutter programs for common ailments. Includes community library entries and personal copies. Do not pass patient information.";

export const searchRoutinesInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description: "Search text (routine name or keywords).",
    },
  },
};

export const searchRoutinesOutputSchema: JsonSchema = {
  allOf: [
    toolResponseBaseSchema,
    {
      type: "object",
      additionalProperties: false,
      required: ["routines"],
      properties: {
        summary: summaryOutputProperty,
        share_link: shareLinkOutputProperty,
        routines: {
          type: "array",
          items: routineSummarySchema,
          description: "Matching routines, empty when none match.",
        },
      },
    },
  ],
};

export const BUILD_OR_EDIT_PROGRAM_TOOL_NAME = "build_or_edit_program" as const;

export const buildOrEditProgramDescription =
  "Build a new program from scratch or from a routine, or edit one existing program located by program_code or non-identifying program_title. A program created from a routine is a separate copy; later routine edits do not change it. There is no push from a routine to existing programs. Rows pin an exercise version and snapshot params and text. The connector cannot create exercises; when an exercise name is not found, the response lists it with a web app search link built from web_app_base_url. Do not include patient information in program_title or row_notes.";

export const buildOrEditProgramInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["web_app_base_url"],
  properties: {
    web_app_base_url: webAppBaseUrlProperty,
    program_code: programCodeProperty,
    program_title: programTitleProperty,
    source_routine_id: {
      type: "string",
      description:
        "When creating a new program, copy from this routine id. Omit when editing an existing program.",
    },
    rows: {
      type: "array",
      items: programRowSchema,
      description:
        "Full program rows to save on this program after the operation. Same exercise may appear more than once.",
    },
  },
};

export const buildOrEditProgramOutputSchema: JsonSchema = {
  allOf: [
    toolResponseBaseSchema,
    {
      type: "object",
      additionalProperties: false,
      required: ["program_code", "program_title", "rows"],
      properties: {
        summary: summaryOutputProperty,
        share_link: shareLinkOutputProperty,
        program_code: programCodeProperty,
        program_title: programTitleProperty,
        source_routine_id: {
          type: "string",
          description: "Routine id when this program was created from a routine.",
        },
        rows: {
          type: "array",
          items: programRowSchema,
        },
        exercises_not_found: {
          type: "array",
          items: exerciseNotFoundSchema,
          description:
            "Exercises referenced in the request that are not approved in the connector.",
        },
      },
    },
  ],
};

export const GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME =
  "get_program_share_link_or_pdf" as const;

export const getProgramShareLinkOrPdfDescription =
  "Get the share link and PDF URL for an existing program found by program_code or non-identifying program_title. Do not pass patient information.";

export const getProgramShareLinkOrPdfInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    program_code: programCodeProperty,
    program_title: programTitleProperty,
    deliverable: {
      type: "string",
      enum: ["share_link", "pdf", "both"],
      description:
        "Which deliverable to return. Default behaviour when omitted is an open question for the server implementation.",
    },
  },
};

export const getProgramShareLinkOrPdfOutputSchema: JsonSchema = {
  allOf: [
    toolResponseBaseSchema,
    {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: summaryOutputProperty,
        share_link: shareLinkOutputProperty,
        pdf_url: {
          type: "string",
          format: "uri",
          description:
            "URL to download or view the program PDF when requested and available.",
        },
        program_code: programCodeProperty,
        program_title: programTitleProperty,
        link_expires_at: {
          type: "string",
          format: "date",
          description:
            "ISO date when the share link expires, if applicable. Never expiry is represented per server rules.",
        },
      },
    },
  ],
};
