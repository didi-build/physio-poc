import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import {
  FreeTextValidationError,
  validateChangeSummary,
  validateExerciseAlias,
  validateExerciseCue,
  validateExerciseTemplateText,
  validateExerciseTitle,
  validateRequestNote,
  validateRequestedExerciseName,
} from "../src/domain/exercise-free-text.js";
import {
  ParamValidationError,
  validateExerciseParams,
} from "../src/domain/exercise-params.js";
import { validateTextOverrides } from "../src/domain/exercise-text-overrides.js";
import {
  MAX_LENGTH_EXERCISE_ALIAS,
  MAX_LENGTH_EXERCISE_CHANGE_SUMMARY,
  MAX_LENGTH_EXERCISE_CUE,
  MAX_LENGTH_EXERCISE_TEMPLATE_TEXT,
} from "../src/mcp-connector/text-limits.js";
import {
  ExerciseAliasesRepository,
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  PractitionerExercisesRepository,
} from "../src/storage/repositories/exercise-data.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";
import {
  MIGRATION_SQL,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";

const REPO_ROOT = join(import.meta.dirname, "..");

async function tableSql(
  storage: BetterSqliteStorage,
  tableName: string,
): Promise<string> {
  const row = await storage.first<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName],
  );
  return row?.sql ?? "";
}

describe("migration and apply runner (CTO round 2)", () => {
  it("migration SQL has no BEGIN or COMMIT", () => {
    expect(MIGRATION_SQL).not.toMatch(/\bBEGIN\b/);
    expect(MIGRATION_SQL).not.toMatch(/\bCOMMIT\b/);
  });

  it("applyMigration source does not reference d1_migrations", () => {
    const source = readFileSync(
      join(REPO_ROOT, "src/storage/migrations/apply.ts"),
      "utf8",
    );
    expect(source.includes("d1_migrations")).toBe(false);
  });

  it("schema defines ON DELETE RESTRICT on every foreign key", async () => {
    const storage = await openMigratedDatabase();
    try {
      const tables = [
        "exercises",
        "exercise_versions",
        "exercise_aliases",
        "exercise_body_regions",
        "exercise_requests",
        "type_defaults",
        "practitioner_exercises",
        "programs",
        "program_rows",
        "share_links",
        "share_link_defaults",
      ];
      for (const name of tables) {
        const sql = await tableSql(storage, name);
        expect(sql, name).toMatch(/ON DELETE RESTRICT/);
      }
    } finally {
      storage.close();
    }
  });

  it("schema defines json_valid on JSON text columns", async () => {
    const storage = await openMigratedDatabase();
    try {
      const typeDefaults = await tableSql(storage, "type_defaults");
      expect(typeDefaults).toMatch(/json_valid\s*\(\s*params_json\s*\)/i);

      const myExercises = await tableSql(storage, "practitioner_exercises");
      expect(myExercises).toMatch(/json_valid\s*\(\s*text_overrides_json\s*\)/i);
      expect(myExercises).toMatch(/json_valid\s*\(\s*param_overrides_json\s*\)/i);
    } finally {
      storage.close();
    }
  });

  it("rejects invalid params_json at the database layer", async () => {
    const storage = await openMigratedDatabase();
    try {
      await expect(
        storage.run(
          `INSERT INTO type_defaults (id, scope, practitioner_id, type, params_json)
           VALUES (?, ?, ?, ?, ?)`,
          ["td-bad-json", "global", null, "isometric", "not-json"],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("RESTRICT prevents deleting a practitioner referenced by exercises", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedExercise(storage, practId);
      await expect(
        storage.run("DELETE FROM practitioners WHERE id = ?", [practId]),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });
});

describe("type_defaults practitioner partial unique index (integration)", () => {
  it("rejects duplicate practitioner rows for the same type", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await storage.run(
        `INSERT INTO type_defaults (id, scope, practitioner_id, type, params_json)
         VALUES (?, ?, ?, ?, ?)`,
        [
          "td-p1",
          "practitioner",
          practId,
          "isometric",
          '{"reps":1,"sets":2,"hold_s":10,"days_per_week":3}',
        ],
      );
      await expect(
        storage.run(
          `INSERT INTO type_defaults (id, scope, practitioner_id, type, params_json)
           VALUES (?, ?, ?, ?, ?)`,
          [
            "td-p2",
            "practitioner",
            practId,
            "isometric",
            '{"reps":2,"sets":2,"hold_s":10,"days_per_week":3}',
          ],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("upsertPractitionerDefaults inserts then updates on conflict", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const repo = new TypeDefaultsRepository(storage);
      await repo.upsertPractitionerDefaults("td-upsert-1", practId, "concentric", {
        reps: 8,
        sets: 2,
      });
      await repo.upsertPractitionerDefaults("td-upsert-2", practId, "concentric", {
        reps: 12,
        sets: 3,
      });
      const row = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practId, "concentric"],
      );
      expect(row?.params_json).toBe('{"reps":12,"sets":3}');
    } finally {
      storage.close();
    }
  });
});

describe("param validation survivors (unit)", () => {
  it("rejects min/max ranges on reps, sets and days_per_week", () => {
    expect(() => validateExerciseParams({ reps: { min: 1, max: 2 } })).toThrow(
      ParamValidationError,
    );
    expect(() => validateExerciseParams({ sets: { min: 1, max: 2 } })).toThrow(
      ParamValidationError,
    );
    expect(() => validateExerciseParams({ days_per_week: { min: 1, max: 2 } })).toThrow(
      ParamValidationError,
    );
  });
});

describe("free-text validation survivors (unit)", () => {
  it("rejects titles below minimum length after trim", () => {
    expect(() => validateExerciseTitle("   ")).toThrow(FreeTextValidationError);
  });

  it("enforces caps and patient-detail checks on overrides and template fields", () => {
    const okTemplate = "a".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT);
    expect(validateExerciseTemplateText(okTemplate, "Steps")).toBe(okTemplate);
    expect(() =>
      validateExerciseTemplateText(
        "a".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 1),
        "Steps",
      ),
    ).toThrow(FreeTextValidationError);

    const okCue = "a".repeat(MAX_LENGTH_EXERCISE_CUE);
    expect(validateExerciseCue(okCue, "cue_stretching")).toBe(okCue);
    expect(() =>
      validateExerciseCue("a".repeat(MAX_LENGTH_EXERCISE_CUE + 1), "cue_stretching"),
    ).toThrow(FreeTextValidationError);

    const okAlias = "a".repeat(MAX_LENGTH_EXERCISE_ALIAS);
    expect(validateExerciseAlias(okAlias)).toBe(okAlias);
    expect(() =>
      validateExerciseAlias("a".repeat(MAX_LENGTH_EXERCISE_ALIAS + 1)),
    ).toThrow(FreeTextValidationError);

    const okSummary = "a".repeat(MAX_LENGTH_EXERCISE_CHANGE_SUMMARY);
    expect(validateChangeSummary(okSummary)).toBe(okSummary);
    expect(() =>
      validateChangeSummary("a".repeat(MAX_LENGTH_EXERCISE_CHANGE_SUMMARY + 1)),
    ).toThrow(FreeTextValidationError);

    expect(() =>
      validateTextOverrides({ description: "patient@example.com in note" }),
    ).toThrow();

    expect(() => validateRequestedExerciseName("bad patient@example.com name")).toThrow(
      FreeTextValidationError,
    );
    expect(() => validateRequestNote("call patient@example.com")).toThrow(
      FreeTextValidationError,
    );
  });
});

describe("repository write validation (integration, SQLite)", () => {
  it("validates PractitionerExercisesRepository upsert text and params", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const repo = new PractitionerExercisesRepository(storage);
      await expect(
        repo.upsert({
          practitionerId: practId,
          exerciseId: exId,
          savedAt: TS,
          textOverrides: { title: 42 } as unknown as { title: string },
        }),
      ).rejects.toThrow();
      await expect(
        repo.upsert({
          practitionerId: practId,
          exerciseId: exId,
          savedAt: TS,
          paramOverrides: { stretching: { sets: 1.5 } },
        }),
      ).rejects.toThrow(ParamValidationError);
    } finally {
      storage.close();
    }
  });

  it("validates exercise versions, aliases and requests on write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const versions = new ExerciseVersionsRepository(storage);
      await expect(
        versions.insert({
          id: "ver-bad-title",
          exerciseId: exId,
          versionNumber: 1,
          status: "draft",
          approvedBy: null,
          approvedAt: null,
          title: "   ",
          steps: "patient@example.com",
          createdAt: TS,
        }),
      ).rejects.toThrow(FreeTextValidationError);

      const aliases = new ExerciseAliasesRepository(storage);
      await expect(
        aliases.insert({
          id: "alias-bad",
          exerciseId: exId,
          alias: "a".repeat(MAX_LENGTH_EXERCISE_ALIAS + 1),
          createdAt: TS,
        }),
      ).rejects.toThrow(FreeTextValidationError);

      const requests = new ExerciseRequestsRepository(storage);
      await expect(
        requests.insert({
          id: "req-bad",
          requestedName: "bad patient@example.com",
          requestedBy: practId,
          status: "open",
          createdAt: TS,
          updatedAt: TS,
        }),
      ).rejects.toThrow(FreeTextValidationError);
    } finally {
      storage.close();
    }
  });
});
