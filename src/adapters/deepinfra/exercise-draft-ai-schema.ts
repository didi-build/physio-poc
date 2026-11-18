import {
  MAX_LENGTH_EXERCISE_ALIAS,
  MAX_LENGTH_EXERCISE_CUE,
  MAX_LENGTH_EXERCISE_TEMPLATE_TEXT,
  MAX_LENGTH_PROGRAM_TITLE,
} from "../../mcp-connector/text-limits.js";
import type { ExerciseCategory } from "../../domain/exercise-types.js";
import {
  SEEDED_BODY_REGION_LABELS,
  isSeededBodyRegionLabel,
} from "./exercise-draft-seeded-body-regions.js";

export const EXERCISE_DRAFT_AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "aliases",
    "category",
    "body_regions",
    "description",
    "equipment",
    "starting_position",
    "steps",
    "common_mistakes",
    "regressions",
    "progressions",
    "precautions",
    "default_sets_and_reps",
    "cue_stretching",
    "cue_isometric",
    "cue_concentric",
    "cue_eccentric",
  ],
  properties: {
    title: { type: "string", minLength: 1, maxLength: MAX_LENGTH_PROGRAM_TITLE },
    aliases: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: MAX_LENGTH_EXERCISE_ALIAS },
    },
    category: { type: "string", enum: ["stretch", "strengthening"] },
    body_regions: {
      type: "array",
      items: { type: "string", enum: [...SEEDED_BODY_REGION_LABELS] },
      minItems: 0,
    },
    description: { type: "string", maxLength: MAX_LENGTH_EXERCISE_TEMPLATE_TEXT },
    equipment: { type: "string", maxLength: MAX_LENGTH_EXERCISE_TEMPLATE_TEXT },
    starting_position: {
      type: "string",
      maxLength: MAX_LENGTH_EXERCISE_TEMPLATE_TEXT,
    },
    steps: { type: "string", maxLength: MAX_LENGTH_EXERCISE_TEMPLATE_TEXT },
    common_mistakes: {
      type: "string",
      maxLength: MAX_LENGTH_EXERCISE_TEMPLATE_TEXT,
    },
    regressions: { type: "string", maxLength: MAX_LENGTH_EXERCISE_TEMPLATE_TEXT },
    progressions: { type: "string", maxLength: MAX_LENGTH_EXERCISE_TEMPLATE_TEXT },
    precautions: { type: "string", maxLength: MAX_LENGTH_EXERCISE_TEMPLATE_TEXT },
    default_sets_and_reps: {
      type: "string",
      minLength: 1,
      maxLength: MAX_LENGTH_EXERCISE_TEMPLATE_TEXT,
    },
    cue_stretching: {
      type: ["string", "null"],
      maxLength: MAX_LENGTH_EXERCISE_CUE,
    },
    cue_isometric: {
      type: ["string", "null"],
      maxLength: MAX_LENGTH_EXERCISE_CUE,
    },
    cue_concentric: {
      type: ["string", "null"],
      maxLength: MAX_LENGTH_EXERCISE_CUE,
    },
    cue_eccentric: {
      type: ["string", "null"],
      maxLength: MAX_LENGTH_EXERCISE_CUE,
    },
  },
} as const;

export type ExerciseDraftAiPayload = {
  title: string;
  aliases: string[];
  category: ExerciseCategory;
  body_regions: string[];
  description: string;
  equipment: string;
  starting_position: string;
  steps: string;
  common_mistakes: string;
  regressions: string;
  progressions: string;
  precautions: string;
  default_sets_and_reps: string;
  cue_stretching: string | null;
  cue_isometric: string | null;
  cue_concentric: string | null;
  cue_eccentric: string | null;
};

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
  );
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isCueField(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }
  return typeof value === "string" && value.length <= MAX_LENGTH_EXERCISE_CUE;
}

export function parseAndValidateExerciseDraftAiPayload(
  value: unknown,
): ExerciseDraftAiPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    !isNonEmptyString(record.title, MAX_LENGTH_PROGRAM_TITLE) ||
    !Array.isArray(record.aliases) ||
    record.aliases.length === 0 ||
    !record.aliases.every((entry) =>
      isNonEmptyString(entry, MAX_LENGTH_EXERCISE_ALIAS),
    ) ||
    (record.category !== "stretch" && record.category !== "strengthening") ||
    !Array.isArray(record.body_regions) ||
    !record.body_regions.every((entry) => isSeededBodyRegionLabel(String(entry))) ||
    !isBoundedString(record.description, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT) ||
    !isBoundedString(record.equipment, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT) ||
    !isBoundedString(record.starting_position, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT) ||
    !isBoundedString(record.steps, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT) ||
    !isBoundedString(record.common_mistakes, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT) ||
    !isBoundedString(record.regressions, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT) ||
    !isBoundedString(record.progressions, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT) ||
    !isBoundedString(record.precautions, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT) ||
    !isNonEmptyString(
      record.default_sets_and_reps,
      MAX_LENGTH_EXERCISE_TEMPLATE_TEXT,
    ) ||
    !isCueField(record.cue_stretching) ||
    !isCueField(record.cue_isometric) ||
    !isCueField(record.cue_concentric) ||
    !isCueField(record.cue_eccentric)
  ) {
    return null;
  }
  return record as ExerciseDraftAiPayload;
}

export function openAiJsonSchemaResponseFormat() {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "exercise_draft",
      strict: true,
      schema: EXERCISE_DRAFT_AI_JSON_SCHEMA,
    },
  };
}
