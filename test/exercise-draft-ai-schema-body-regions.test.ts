import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXERCISE_DRAFT_AI_JSON_SCHEMA,
  parseAndValidateExerciseDraftAiPayload,
} from "../src/adapters/deepinfra/exercise-draft-ai-schema.js";
import { SEEDED_BODY_REGION_LABELS } from "../src/adapters/deepinfra/exercise-draft-seeded-body-regions.js";

const VALID_STRETCH = {
  title: "Heel slide",
  aliases: ["Heel slides"],
  category: "stretch",
  body_regions: ["knee"],
  description: "Gentle knee flexion stretch.",
  equipment: "Mat",
  starting_position: "Supine on mat.",
  steps: "1. Bend knee",
  common_mistakes: "Rushing",
  regressions: "Smaller range",
  progressions: "Hold longer",
  precautions: "Stop if pain",
  default_sets_and_reps: "3 sets, 10 reps",
  cue_stretching: "Move slowly",
  cue_isometric: null,
  cue_concentric: null,
  cue_eccentric: null,
} as const;

function seededLabelsFromMigration0001(): string[] {
  const sql = readFileSync(
    join(process.cwd(), "migrations/0001_exercise_data_model.sql"),
    "utf8",
  );
  const block = sql.slice(sql.indexOf("INSERT INTO body_regions"));
  const labels: string[] = [];
  for (const match of block.matchAll(/\('br-[^']+',\s*'([^']+)'\)/g)) {
    labels.push(match[1]!);
  }
  return labels;
}

describe("exercise draft AI schema body_regions", () => {
  it("pins the JSON schema enum to migration 0001 seeded labels (knee, ankle, hip)", () => {
    const migrationLabels = seededLabelsFromMigration0001();
    expect(migrationLabels).toEqual(["knee", "ankle", "hip"]);
    const items = EXERCISE_DRAFT_AI_JSON_SCHEMA.properties.body_regions.items as {
      enum: readonly string[];
    };
    const enumValues = [...items.enum];
    expect([...enumValues].sort()).toEqual([...SEEDED_BODY_REGION_LABELS].sort());
    expect(enumValues).toEqual(migrationLabels);
  });

  it("rejects unknown body region labels (mutant: accept unknown region)", () => {
    const invalid = {
      ...VALID_STRETCH,
      body_regions: ["shoulder"],
    };
    expect(parseAndValidateExerciseDraftAiPayload(invalid)).toBeNull();
  });

  it("accepts an empty body_regions list when none of the seeded regions apply", () => {
    const emptyRegions = {
      ...VALID_STRETCH,
      body_regions: [] as string[],
    };
    expect(parseAndValidateExerciseDraftAiPayload(emptyRegions)).not.toBeNull();
  });
});
