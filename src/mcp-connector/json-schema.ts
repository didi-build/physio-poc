/**
 * Shared JSON Schema fragments for Physio MCP connector tools.
 * No runtime or platform imports.
 */

export type JsonSchema = {
  readonly [key: string]: unknown;
};

export const WEB_APP_BASE_URL_PARAM = {
  name: "web_app_base_url",
  description:
    "HTTPS origin for the Physio web app (no trailing slash). Used to build exercise search links when an exercise is not found. Do not put patient information in this URL.",
} as const;

export const webAppBaseUrlProperty: JsonSchema = {
  type: "string",
  format: "uri",
  description: WEB_APP_BASE_URL_PARAM.description,
};

export const summaryOutputProperty: JsonSchema = {
  type: "string",
  description:
    "Plain text summary for the assistant to read aloud or show. Must not contain patient information.",
};

export const shareLinkOutputProperty: JsonSchema = {
  type: "string",
  format: "uri",
  description:
    "HTTPS share link for the program when this call affects or returns one program. Empty string when no program link applies.",
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
  maxLength: 200,
  description:
    "Non-identifying program title the practitioner uses to recognise this program later. Do not use patient names, initials, dates of birth, diagnoses, or any text that identifies a person.",
};

export const programCodeProperty: JsonSchema = {
  type: "string",
  pattern: "^PRG-[A-Z0-9]+$",
  description: "Stable program code assigned by the system (for example PRG-7K3Q).",
};

export const programRowSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["exercise_version_id", "prescription_type", "params"],
  properties: {
    exercise_version_id: {
      type: "string",
      description: "Pinned approved exercise version id for this row.",
    },
    prescription_type: prescriptionTypeSchema,
    params: rowParamsSchema,
    row_notes: {
      type: "string",
      maxLength: 500,
      description:
        "Optional notes about the exercise prescription on this row only. Do not include patient information.",
    },
  },
  description:
    "One row in a program. Snapshots params and text; the same exercise may appear more than once.",
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
    routine_name: { type: "string" },
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
      description: "Exercise name that has no approved match in the connector.",
    },
    web_app_exercise_search_url: {
      type: "string",
      format: "uri",
      description:
        "Web app exercise search URL with the query prefilled, built from web_app_base_url and the requested name.",
    },
  },
};

export const toolResponseBaseSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "share_link"],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
  },
};
