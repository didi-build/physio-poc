/**
 * Shared JSON Schema fragments for Physio MCP connector tools.
 * No runtime or platform imports.
 */

import { SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM } from "./share-link-expiry.js";
import {
  FREE_TEXT_NO_PATIENT_DETAILS,
  MAX_LENGTH_PROGRAM_TITLE,
  MAX_LENGTH_REQUESTED_EXERCISE_NAME,
  MAX_LENGTH_ROUTINE_NAME,
  MAX_LENGTH_ROW_NOTES,
  MAX_LENGTH_SUMMARY,
} from "./text-limits.js";

export type JsonSchema = {
  readonly [key: string]: unknown;
};

export const uriOrEmptyStringSchema: JsonSchema = {
  oneOf: [
    { type: "string", format: "uri" },
    { type: "string", enum: [""] },
  ],
  description: "HTTPS URL, or an empty string when no link applies.",
};

export const paginationLimitProperty: JsonSchema = {
  type: "integer",
  minimum: 1,
  maximum: 25,
  default: 10,
  description: "Maximum results to return (default 10, max 25).",
};

export const paginationCursorInputProperty: JsonSchema = {
  type: "string",
  description:
    "Opaque cursor from a previous response next_cursor. Omit on the first page.",
};

export const paginationNextCursorOutputProperty: JsonSchema = {
  type: "string",
  description: "Opaque cursor for the next page. Omit when there are no more results.",
};

export const summaryOutputProperty: JsonSchema = {
  type: "string",
  maxLength: MAX_LENGTH_SUMMARY,
  description: `Plain text summary for the assistant. ${FREE_TEXT_NO_PATIENT_DETAILS}`,
};

export const shareLinkOutputProperty: JsonSchema = {
  ...uriOrEmptyStringSchema,
  description:
    "HTTPS share link for the program when a published version exists or after publish. Empty string when no published link applies.",
};

export const pdfUrlOutputProperty: JsonSchema = {
  ...uriOrEmptyStringSchema,
  description:
    "HTTPS URL of the server-rendered program PDF. Never inline bytes. Empty when no published PDF applies.",
};

export const searchLinkOutputProperty: JsonSchema = {
  type: "string",
  format: "uri",
  description:
    "Prefilled web app exercise search URL when the query returned zero approved exercises. Built from server-configured base URL.",
};

export const manageUrlOutputProperty: JsonSchema = {
  ...uriOrEmptyStringSchema,
  description:
    "HTTPS link to manage the program in the web app (delete and link close are web app only in v1). Empty when no program applies.",
};

export const expiresAtOutputProperty: JsonSchema = {
  type: "string",
  format: "date-time",
  description:
    "When the published share link expires. Omitted when there is no published link.",
};

export const programVersionRefSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "updated_at"],
  properties: {
    version: {
      type: "integer",
      minimum: 1,
      description: "Monotonic program version number for this snapshot.",
    },
    updated_at: {
      type: "string",
      format: "date-time",
      description: "When this version was last saved.",
    },
  },
};

export const nullableProgramVersionRefSchema: JsonSchema = {
  oneOf: [{ type: "null" }, programVersionRefSchema],
  description: "Null when that side (draft or published) does not exist.",
};

export const publishOverridesInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    expires_in: {
      type: "string",
      enum: SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM,
      description:
        "Share link expiry for this publish. Omit overrides entirely to use the practitioner default.",
    },
    custom_date: {
      type: "string",
      format: "date",
      description:
        "Required when expires_in is custom_date. Any calendar date from tomorrow onward per product rules.",
    },
  },
  allOf: [
    {
      if: {
        properties: {
          expires_in: { const: "custom_date" },
        },
        required: ["expires_in"],
      },
      then: {
        required: ["custom_date"],
      },
    },
  ],
};

export const exerciseCategorySchema: JsonSchema = {
  type: "string",
  enum: ["Stretching", "Strengthening"],
  description: "Exercise library category filter.",
};

export const prescriptionTypeSchema: JsonSchema = {
  type: "string",
  enum: ["stretching", "isometric", "concentric", "eccentric"],
  description:
    "How this exercise is prescribed on this program row. Stretch exercises use stretching only. Strengthening exercises use isometric, concentric, or eccentric.",
};

export const numericOrRangeSchema: JsonSchema = {
  oneOf: [
    { type: "number" },
    {
      type: "object",
      additionalProperties: false,
      required: ["min", "max"],
      properties: {
        min: { type: "number" },
        max: { type: "number" },
      },
      description: "Inclusive numeric range.",
    },
  ],
};

export const rowParamsSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reps: numericOrRangeSchema,
    sets: numericOrRangeSchema,
    hold_s: numericOrRangeSchema,
    ascent_s: numericOrRangeSchema,
    descent_s: numericOrRangeSchema,
    rest_s: numericOrRangeSchema,
    per_day: numericOrRangeSchema,
    days_per_week: numericOrRangeSchema,
  },
  description:
    "Dose parameters for this program row. Only include keys that apply to the exercise and prescription type.",
};

export const programTitleProperty: JsonSchema = {
  type: "string",
  maxLength: MAX_LENGTH_PROGRAM_TITLE,
  description: `Non-identifying program title the practitioner uses to recognise this program later. ${FREE_TEXT_NO_PATIENT_DETAILS}`,
};

export const programCodeProperty: JsonSchema = {
  type: "string",
  pattern: "^PRG-[A-Z0-9]+$",
  description: "Stable program code assigned by the system (for example PRG-7K3Q).",
};

const programRowSharedProperties: Record<string, JsonSchema> = {
  prescription_type: prescriptionTypeSchema,
  params: rowParamsSchema,
  row_notes: {
    type: "string",
    maxLength: MAX_LENGTH_ROW_NOTES,
    description: `Optional notes about the exercise prescription on this row only. ${FREE_TEXT_NO_PATIENT_DETAILS}`,
  },
};

export const programRowInputSchema: JsonSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["exercise_version_id", "prescription_type", "params"],
      properties: {
        exercise_version_id: {
          type: "string",
          description: "Pinned approved exercise version id for this row.",
        },
        ...programRowSharedProperties,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["exercise_name", "prescription_type", "params"],
      properties: {
        exercise_name: {
          type: "string",
          minLength: 1,
          maxLength: MAX_LENGTH_REQUESTED_EXERCISE_NAME,
          description: `Approved exercise display name or alias; server resolves case-insensitively. ${FREE_TEXT_NO_PATIENT_DETAILS}`,
        },
        ...programRowSharedProperties,
      },
    },
  ],
  description:
    "One row in a program request. Provide exercise_version_id or exercise_name, not both. Same exercise may appear more than once.",
};

export const programRowOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["exercise_version_id", "exercise_name", "prescription_type", "params"],
  properties: {
    exercise_version_id: {
      type: "string",
      description: "Pinned approved exercise version id saved on this row.",
    },
    exercise_name: {
      type: "string",
      description: "Display name snapshot for this row.",
    },
    ...programRowSharedProperties,
  },
  description:
    "One saved program row. Snapshots params and text; unresolved names are omitted from rows and listed under exercises_not_found.",
};

export const approvedExerciseSummarySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["exercise_version_id", "exercise_name", "category"],
  properties: {
    exercise_version_id: { type: "string" },
    exercise_name: {
      type: "string",
      description: "Approved exercise display name.",
    },
    category: exerciseCategorySchema,
    body_regions: {
      type: "array",
      items: { type: "string" },
      description: "Body region labels from the seeded list.",
    },
    allowed_prescription_types: {
      type: "array",
      items: prescriptionTypeSchema,
      description: "Prescription types allowed for this exercise on a program row.",
    },
  },
};

export const exerciseNotFoundCandidateSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["exercise_version_id", "exercise_name"],
  properties: {
    exercise_version_id: { type: "string" },
    exercise_name: { type: "string" },
  },
};

export const routineSummarySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["routine_id", "routine_name", "routine_version"],
  properties: {
    routine_id: { type: "string" },
    routine_name: {
      type: "string",
      maxLength: MAX_LENGTH_ROUTINE_NAME,
      description: `Routine display name. ${FREE_TEXT_NO_PATIENT_DETAILS}`,
    },
    routine_version: { type: "integer", minimum: 1 },
    exercise_count: { type: "integer", minimum: 0 },
    source: {
      type: "string",
      enum: ["community", "personal_copy"],
      description: "Whether this hit is the community routine or a personal copy.",
    },
  },
};

export const exerciseNotFoundSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requested_exercise_name", "web_app_exercise_search_url"],
  properties: {
    requested_exercise_name: {
      type: "string",
      maxLength: MAX_LENGTH_REQUESTED_EXERCISE_NAME,
      description: `Exercise name that could not be resolved to exactly one approved exercise. ${FREE_TEXT_NO_PATIENT_DETAILS}`,
    },
    candidate_matches: {
      type: "array",
      maxItems: 3,
      items: exerciseNotFoundCandidateSchema,
      description:
        "Up to three similar approved exercises when the name was ambiguous.",
    },
    web_app_exercise_search_url: {
      type: "string",
      format: "uri",
      description:
        "Web app exercise search URL with the query prefilled, built from server-configured web app base URL and the requested name.",
    },
  },
};

export const ambiguousProgramMatchSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program_code", "program_title", "updated_at"],
  properties: {
    program_code: programCodeProperty,
    program_title: programTitleProperty,
    updated_at: {
      type: "string",
      format: "date-time",
      description: "When this program was last updated.",
    },
  },
};
