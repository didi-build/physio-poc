/** QA literal pins: independent of production exports so prompt/schema mutants fail tests. */

export const PINNED_DEEPINFRA_EXERCISE_DRAFT_REQUEST_TIMEOUT_MS = 90000 as const;

export const PINNED_EXERCISE_DRAFT_SYSTEM_PROMPT = `You draft exercise library entries for physiotherapy practitioners. Reply with a single JSON object that matches the exercise_draft schema exactly.

Clinical text you write is always a draft for practitioner review and approval. Nothing you output goes live without human sign-off.

Never include patient-identifying or patient-specific information (names, contact details, health card numbers, dates of birth, or similar).

Use only the practitioner-supplied exercise name and their optional notes. Fill the template fields: title, aliases, category (stretch or strengthening), body_regions, description, equipment, starting_position, ending_position, steps, common_mistakes, regressions, progressions, precautions, and cue lines. For body_regions, use free-text region names.

The ending_position must describe the end pose of only the body parts involved in the exercise's movement; every other body part stays as in the starting_position.

For stretch exercises, provide cue_stretching and set cue_isometric, cue_concentric, and cue_eccentric to null. For strengthening exercises, provide cue_isometric, cue_concentric, and cue_eccentric and set cue_stretching to null.

Write clear, practical physiotherapy language suitable for a shared exercise library.`;

export const PINNED_EXERCISE_DRAFT_JSON_SCHEMA = {
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
    "ending_position",
    "steps",
    "common_mistakes",
    "regressions",
    "progressions",
    "precautions",
    "cue_stretching",
    "cue_isometric",
    "cue_concentric",
    "cue_eccentric",
  ],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 80 },
    aliases: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1, maxLength: 100 },
    },
    category: { type: "string", enum: ["stretch", "strengthening"] },
    body_regions: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 80 },
      minItems: 1,
    },
    description: { type: "string", maxLength: 4000 },
    equipment: { type: "string", maxLength: 4000 },
    starting_position: { type: "string", maxLength: 4000 },
    ending_position: { type: "string", maxLength: 4000 },
    steps: { type: "string", maxLength: 4000 },
    common_mistakes: { type: "string", maxLength: 4000 },
    regressions: { type: "string", maxLength: 4000 },
    progressions: { type: "string", maxLength: 4000 },
    precautions: { type: "string", maxLength: 4000 },
    cue_stretching: { type: ["string", "null"], maxLength: 500 },
    cue_isometric: { type: ["string", "null"], maxLength: 500 },
    cue_concentric: { type: ["string", "null"], maxLength: 500 },
    cue_eccentric: { type: ["string", "null"], maxLength: 500 },
  },
} as const;

export const PINNED_EXERCISE_DRAFT_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "exercise_draft",
    strict: true,
    schema: PINNED_EXERCISE_DRAFT_JSON_SCHEMA,
  },
};
