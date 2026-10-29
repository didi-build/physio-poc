import { describe, expect, it } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import {
  FreeTextValidationError,
  validateChangeSummary,
  validateExerciseAlias,
  validateExerciseCue,
  validateExerciseTemplateText,
} from "../src/domain/exercise-free-text.js";
import {
  TextOverrideValidationError,
  validateTextOverrides,
} from "../src/domain/exercise-text-overrides.js";
import { MAX_LENGTH_EXERCISE_TEMPLATE_TEXT } from "../src/mcp-connector/text-limits.js";
import { ExerciseVersionsRepository } from "../src/storage/repositories/exercise-data.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";

/** Made-up date string; must not match a real person. */
const FAKE_DOB_SNIPPET = "DOB 1990-01-01";

type ForeignKeyListRow = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
};

async function foreignKeysAcrossSchema(
  storage: BetterSqliteStorage,
): Promise<ForeignKeyListRow[]> {
  const tables = await storage.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const all: ForeignKeyListRow[] = [];
  for (const { name } of tables) {
    const escaped = name.replace(/'/g, "''");
    const rows = await storage.all<ForeignKeyListRow>(
      `PRAGMA foreign_key_list('${escaped}')`,
    );
    all.push(...rows);
  }
  return all;
}

function validVersionInsert(
  exerciseId: string,
  overrides: { title?: string; steps?: string } = {},
) {
  return {
    id: "ver-qa3",
    exerciseId,
    versionNumber: 1,
    status: "draft" as const,
    approvedBy: null,
    approvedAt: null,
    title: overrides.title ?? "Heel slide",
    steps: overrides.steps ?? "Step one, then step two.",
    createdAt: TS,
  };
}

describe("QA round 3: description override length boundary (unit)", () => {
  it("accepts a description override of exactly 4000 characters and rejects 4001", () => {
    const exact = "x".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT);
    expect(validateTextOverrides({ description: exact })).toEqual({
      description: { value: exact, base: exact },
    });
    expect(() =>
      validateTextOverrides({
        description: "x".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 1),
      }),
    ).toThrow(TextOverrideValidationError);
  });
});

describe("QA round 3: patient-detail rejection by field (unit)", () => {
  it("rejects a cue line containing a made-up date-of-birth snippet", () => {
    expect(() =>
      validateExerciseCue(`Hold steady. ${FAKE_DOB_SNIPPET}`, "cue_stretching"),
    ).toThrow(FreeTextValidationError);
  });

  it("rejects template text containing a made-up date-of-birth snippet", () => {
    expect(() =>
      validateExerciseTemplateText(`Notes: ${FAKE_DOB_SNIPPET}`, "Steps"),
    ).toThrow(FreeTextValidationError);
  });

  it("rejects an alias containing a made-up date-of-birth snippet", () => {
    expect(() => validateExerciseAlias(`stretch-${FAKE_DOB_SNIPPET}`)).toThrow(
      FreeTextValidationError,
    );
  });

  it("rejects change summary containing a made-up date-of-birth snippet", () => {
    expect(() => validateChangeSummary(`Edited after ${FAKE_DOB_SNIPPET}`)).toThrow(
      FreeTextValidationError,
    );
  });
});

describe("QA round 3: exercise versions repository (integration, SQLite)", () => {
  it("rejects when only title is invalid and steps are valid", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const versions = new ExerciseVersionsRepository(storage);
      await expect(
        versions.insert(validVersionInsert(exId, { title: "   " })),
      ).rejects.toThrow(FreeTextValidationError);
    } finally {
      storage.close();
    }
  });

  it("rejects when only steps are invalid and title is valid", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const versions = new ExerciseVersionsRepository(storage);
      await expect(
        versions.insert(
          validVersionInsert(exId, { steps: `Do this slowly. ${FAKE_DOB_SNIPPET}` }),
        ),
      ).rejects.toThrow(FreeTextValidationError);
    } finally {
      storage.close();
    }
  });
});

describe("QA round 3: foreign key list (integration, SQLite)", () => {
  it("lists exactly 11 foreign keys and each uses ON DELETE RESTRICT", async () => {
    const storage = await openMigratedDatabase();
    try {
      const fks = await foreignKeysAcrossSchema(storage);
      expect(fks).toHaveLength(11);
      for (const fk of fks) {
        expect(fk.on_delete).toBe("RESTRICT");
      }
    } finally {
      storage.close();
    }
  });
});
