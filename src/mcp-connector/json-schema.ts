/**
 * Shared JSON Schema fragments for Physio MCP connector tools.
 * No runtime or platform imports.
 */

import {
  OPAQUE_ENTITY_ID_LENGTH,
  OPAQUE_ENTITY_ID_PATTERN,
} from "../domain/opaque-entity-id.js";
import {
  FREE_TEXT_NO_PATIENT_DETAILS,
  MAX_LENGTH_PROGRAM_TITLE,
  MAX_LENGTH_REQUESTED_EXERCISE_NAME,
  MAX_LENGTH_ROUTINE_NAME,
  MAX_LENGTH_ROW_NOTES,
  MAX_LENGTH_SUMMARY,
} from "./text-limits.js";
import { SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM } from "./share-link-expiry.js";

export type JsonSchema = {
  readonly [key: string]: unknown;
};

/** Write free-text fields only (DIDI-594 comment 5d59df38). */
export const WRITE_FREE_TEXT_PATIENT_INFORMATION_DESCRIPTION =
  "Do not pass patient information." as const;

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
    "HTTPS link to open the related screen in the web app. Empty when no screen applies.",
};

export const builderLinkOutputProperty: JsonSchema = {
  type: "string",
  format: "uri",
  description:
    "Deep link to the program builder in the web app (built from server-configured base URL and shared route table).",
};

export const publishLinkOutputProperty: JsonSchema = {
  ...uriOrEmptyStringSchema,
  description:
    "Deep link to the program publish page when a draft needs publishing. Empty when no draft publish page applies.",
};

export const manageLinkOutputProperty: JsonSchema = {
  ...uriOrEmptyStringSchema,
  description:
    "Deep link to the program share page in the web app (expiry, close link, delete). Empty when no program applies.",
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

/** Publish overrides: expires_in + optional custom_date when expires_in is custom_date (v13). */
export const publishOverridesInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    expires_in: {
      type: "string",
      enum: SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM,
    },
    custom_date: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
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

/** Enum values locked in share-link-expiry.ts (invalid_expiry uses v13 REUSED copy at runtime). */
export const shareLinkExpiresInInputProperty: JsonSchema = {
  type: "string",
  enum: SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM,
};

/** YYYY-MM-DD when expires_in is custom_date; validated server-side (DIDI-1244). */
export const shareLinkCustomDateInputProperty: JsonSchema = {
  type: "string",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
};

export const exerciseNotFoundCandidateSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["exercise_version_id", "exercise_name"],
  properties: {
    exercise_version_id: { type: "string" },
    exercise_name: {
      type: "string",
    },
  },
};

/** Partial-result row when an exercise name does not resolve (DIDI-989 #6). */
export const exerciseNotFoundSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requested_exercise_name", "web_app_exercise_search_url"],
  properties: {
    requested_exercise_name: {
      type: "string",
      maxLength: MAX_LENGTH_REQUESTED_EXERCISE_NAME,
    },
    candidate_matches: {
      type: "array",
      maxItems: 3,
      items: exerciseNotFoundCandidateSchema,
    },
    web_app_exercise_search_url: {
      type: "string",
      format: "uri",
    },
  },
};

/** Republish confirm: one line per change (v13 publish republish REUSED). */
export const publishChangeLinesOutputProperty: JsonSchema = {
  type: "array",
  items: { type: "string" },
};

/** Delete output: last restore day (v13 delete after-yes REUSED). */
export const restoreUntilOutputProperty: JsonSchema = {
  type: "string",
  format: "date",
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

/** Write tools: program title input cap; patient-information line only (no other copy). */
export const writeProgramTitleInputProperty: JsonSchema = {
  type: "string",
  maxLength: MAX_LENGTH_PROGRAM_TITLE,
  description: WRITE_FREE_TEXT_PATIENT_INFORMATION_DESCRIPTION,
};

export const nullableProgramTitleProperty: JsonSchema = {
  type: ["string", "null"],
  maxLength: MAX_LENGTH_PROGRAM_TITLE,
  description: `Non-identifying program title, or null when unset. ${FREE_TEXT_NO_PATIENT_DETAILS}`,
};

/** Write tool outputs: nullable program title; no field description (CTO 343fc67a). */
export const writeNullableProgramTitleOutputProperty: JsonSchema = {
  type: ["string", "null"],
  maxLength: MAX_LENGTH_PROGRAM_TITLE,
};

export const matchCountOutputProperty: JsonSchema = {
  type: "integer",
  minimum: 0,
  description: "Number of approved exercises returned in exercises.",
};

export const exerciseCountOutputProperty: JsonSchema = {
  type: "integer",
  minimum: 0,
  description: "Number of exercises on the program draft.",
};

export const draftStateOutputProperty: JsonSchema = {
  type: "string",
  enum: ["draft_only", "published_only", "published_with_draft_changes"],
  description:
    "Whether the program is draft-only, published, or published with newer draft changes.",
};

export const hasNewerDraftOutputProperty: JsonSchema = {
  type: "boolean",
  description:
    "True when a published version exists and the saved draft is newer than what patients see.",
};

export const shareLinkStateOutputProperty: JsonSchema = {
  type: "string",
  enum: ["live", "closed", "expired", "none"],
  description: "Whether the program has a live, closed, expired, or no share link.",
};

export const programCodeProperty: JsonSchema = {
  type: "string",
  pattern: "^PRG-[A-Z0-9]+$",
  description: "Stable program code assigned by the system (for example PRG-7K3Q).",
};

export const routineIdProperty: JsonSchema = {
  type: "string",
  pattern: OPAQUE_ENTITY_ID_PATTERN,
  maxLength: OPAQUE_ENTITY_ID_LENGTH,
  description:
    "Opaque routine id assigned by the system (UUID v4, hex case insensitive, for example 550e8400-e29b-41d4-a716-446655440000).",
};

/** Write program rows: same shapes as read/search schemas, no non-v13 descriptions. */
const writeNumericOrRangeSchema: JsonSchema = {
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
    },
  ],
};

const writeRowParamsSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reps: writeNumericOrRangeSchema,
    sets: writeNumericOrRangeSchema,
    hold_s: writeNumericOrRangeSchema,
    ascent_s: writeNumericOrRangeSchema,
    descent_s: writeNumericOrRangeSchema,
    rest_s: writeNumericOrRangeSchema,
    per_day: writeNumericOrRangeSchema,
    days_per_week: writeNumericOrRangeSchema,
  },
};

const writePrescriptionTypeSchema: JsonSchema = {
  type: "string",
  enum: ["stretching", "isometric", "concentric", "eccentric"],
};

const programRowSharedPropertiesWrite: Record<string, JsonSchema> = {
  prescription_type: writePrescriptionTypeSchema,
  params: writeRowParamsSchema,
  row_notes: {
    type: "string",
    maxLength: MAX_LENGTH_ROW_NOTES,
    description: WRITE_FREE_TEXT_PATIENT_INFORMATION_DESCRIPTION,
  },
};

/** Row input: exercise_version_id XOR exercise_name (DIDI-989 #6). */
export const programRowInputSchema: JsonSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["exercise_version_id", "prescription_type", "params"],
      properties: {
        exercise_version_id: {
          type: "string",
        },
        ...programRowSharedPropertiesWrite,
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
          description: WRITE_FREE_TEXT_PATIENT_INFORMATION_DESCRIPTION,
        },
        ...programRowSharedPropertiesWrite,
      },
    },
  ],
};

const programRowSharedPropertiesWriteOutput: Record<string, JsonSchema> = {
  prescription_type: writePrescriptionTypeSchema,
  params: writeRowParamsSchema,
  row_notes: {
    type: "string",
    maxLength: MAX_LENGTH_ROW_NOTES,
  },
};

/** Saved row shape after write (DIDI-1244). */
export const programRowOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["exercise_version_id", "exercise_name", "prescription_type", "params"],
  properties: {
    exercise_version_id: {
      type: "string",
    },
    exercise_name: {
      type: "string",
    },
    ...programRowSharedPropertiesWriteOutput,
  },
};

/** Write tools: URI or empty string without read-schema description text. */
export const writeUriOrEmptyStringSchema: JsonSchema = {
  oneOf: [
    { type: "string", format: "uri" },
    { type: "string", enum: [""] },
  ],
};

export const writeSummaryOutputProperty: JsonSchema = {
  type: "string",
  maxLength: MAX_LENGTH_SUMMARY,
};

export const writeShareLinkOutputProperty: JsonSchema = writeUriOrEmptyStringSchema;

export const writePdfUrlOutputProperty: JsonSchema = writeUriOrEmptyStringSchema;

export const writeManageUrlOutputProperty: JsonSchema = writeUriOrEmptyStringSchema;

export const writeExpiresAtOutputProperty: JsonSchema = {
  type: "string",
  format: "date-time",
};

export const writeProgramVersionRefSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "updated_at"],
  properties: {
    version: { type: "integer", minimum: 1 },
    updated_at: { type: "string", format: "date-time" },
  },
};

export const writeNullableProgramVersionRefSchema: JsonSchema = {
  oneOf: [{ type: "null" }, writeProgramVersionRefSchema],
};

export const writeExerciseCountOutputProperty: JsonSchema = {
  type: "integer",
  minimum: 0,
};

export const writeDraftStateOutputProperty: JsonSchema = {
  type: "string",
  enum: ["draft_only", "published_only", "published_with_draft_changes"],
};

export const writeShareLinkStateOutputProperty: JsonSchema = {
  type: "string",
  enum: ["live", "closed", "expired", "none"],
};

/** Write tool inputs: program code without read-schema description text. */
export const writeProgramCodeProperty: JsonSchema = {
  type: "string",
  pattern: "^PRG-[A-Z0-9]+$",
};

/** Write tool output: source routine id without read-schema description text. */
export const writeRoutineIdOutputProperty: JsonSchema = {
  type: "string",
  pattern: OPAQUE_ENTITY_ID_PATTERN,
  maxLength: OPAQUE_ENTITY_ID_LENGTH,
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

export const ambiguousProgramMatchSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program_code", "program_title"],
  properties: {
    program_code: programCodeProperty,
    program_title: nullableProgramTitleProperty,
  },
};
