import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  captureApplicationSchemaFromPath,
  listAppliedMigrationNamesFromPath,
  mutateSnapshotChangeColumnType,
  mutateSnapshotDropColumn,
  mutateSnapshotDropIndex,
  resolveLocalD1SqlitePath,
  schemasEqual,
  type ApplicationSchemaSnapshot,
} from "./helpers/d1-application-schema-snapshot.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const WRANGLER_BIN = join(REPO_ROOT, "node_modules/wrangler/bin/wrangler.js");
const D1_DATABASE_NAME = "physio-poc-migrations-test";

const PHASE1_MIGRATION_FILES = [
  "0001_exercise_data_model.sql",
  "0002_program_data_model.sql",
  "0005_routine_data_model.sql",
] as const;

const EXPECTED_MIGRATION_FILES = [
  ...PHASE1_MIGRATION_FILES.slice(0, 2),
  "0003_exercise_media.sql",
  "0004_better_auth.sql",
  PHASE1_MIGRATION_FILES[2],
  "0006_mcp_oauth.sql",
] as const;

function materializePhase1MigrationsDir(targetDir: string): void {
  rmSync(targetDir, { recursive: true, force: true });
  cpSync(join(REPO_ROOT, "migrations"), targetDir, { recursive: true });
  for (const name of readdirSync(targetDir)) {
    if (
      !PHASE1_MIGRATION_FILES.includes(name as (typeof PHASE1_MIGRATION_FILES)[number])
    ) {
      rmSync(join(targetDir, name));
    }
  }
}

function writeWranglerConfig(migrationsDir: string, configPath: string): void {
  const body = {
    name: "physio-poc-d1-migrations-test",
    main: "src/entry/worker.ts",
    compatibility_date: "2025-10-29",
    d1_databases: [
      {
        binding: "PHYSIO_DB",
        database_name: D1_DATABASE_NAME,
        database_id: "00000000-0000-0000-0000-000000000001",
        migrations_dir: migrationsDir,
      },
    ],
  };
  writeFileSync(configPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

function runWrangler(
  args: string[],
  options: { persistTo: string; configPath: string },
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    process.execPath,
    [
      WRANGLER_BIN,
      ...args,
      "--local",
      "--persist-to",
      options.persistTo,
      "-c",
      options.configPath,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, CI: "true" },
    },
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

function applyLocalMigrations(persistTo: string, configPath: string): void {
  const result = runWrangler(["d1", "migrations", "apply", D1_DATABASE_NAME], {
    persistTo,
    configPath,
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function listAppliedMigrationNames(persistTo: string): string[] {
  return listAppliedMigrationNamesFromPath(resolveLocalD1SqlitePath(persistTo));
}

function expectSchemasEqual(
  actual: ApplicationSchemaSnapshot,
  expected: ApplicationSchemaSnapshot,
): void {
  expect(schemasEqual(actual, expected)).toBe(true);
}

describe("application schema snapshot comparison (unit)", () => {
  const base: ApplicationSchemaSnapshot = {
    exercises: {
      createSql:
        'CREATE TABLE "exercises" (id TEXT PRIMARY KEY, category TEXT NOT NULL)',
      columns: [
        {
          name: "id",
          type: "TEXT",
          notNull: false,
          defaultValue: null,
          primaryKey: 1,
        },
        {
          name: "category",
          type: "TEXT",
          notNull: true,
          defaultValue: null,
          primaryKey: 0,
        },
      ],
      foreignKeys: [],
      indexes: [
        {
          name: "idx_exercises_category",
          unique: false,
          origin: "c",
          partial: false,
          sql: "CREATE INDEX idx_exercises_category ON exercises (category)",
          columns: [{ seqno: 0, cid: 1, name: "category" }],
        },
      ],
    },
  };

  it("detects a dropped column", () => {
    const mutated = mutateSnapshotDropColumn(base, "exercises", "category");
    expect(schemasEqual(base, mutated)).toBe(false);
  });

  it("detects a changed column type", () => {
    const mutated = mutateSnapshotChangeColumnType(
      base,
      "exercises",
      "category",
      "INTEGER",
    );
    expect(schemasEqual(base, mutated)).toBe(false);
  });

  it("detects a dropped index", () => {
    const mutated = mutateSnapshotDropIndex(
      base,
      "exercises",
      "idx_exercises_category",
    );
    expect(schemasEqual(base, mutated)).toBe(false);
  });
});

describe("D1 wrangler migrations out-of-order landing (integration, local D1)", () => {
  it("applies 0003 and 0004 after 0005 and matches in-order full schema", () => {
    const persistRoot = mkdtempSync(join(tmpdir(), "physio-d1-mig-"));
    const configDir = mkdtempSync(join(tmpdir(), "physio-d1-wrangler-config-"));
    const phase1MigrationsDir = join(configDir, "phase1-migrations");
    const phase1Config = join(configDir, "phase1.jsonc");
    const fullConfig = join(configDir, "full.jsonc");

    materializePhase1MigrationsDir(phase1MigrationsDir);
    writeWranglerConfig(phase1MigrationsDir, phase1Config);
    writeWranglerConfig(join(REPO_ROOT, "migrations"), fullConfig);

    try {
      applyLocalMigrations(persistRoot, phase1Config);

      const afterPhase1 = listAppliedMigrationNames(persistRoot);
      expect(afterPhase1).toEqual([...PHASE1_MIGRATION_FILES]);

      applyLocalMigrations(persistRoot, fullConfig);

      const applied = listAppliedMigrationNames(persistRoot);
      expect(applied).toHaveLength(EXPECTED_MIGRATION_FILES.length);
      expect([...applied].sort()).toEqual([...EXPECTED_MIGRATION_FILES].sort());

      const outOfOrderSchema = captureApplicationSchemaFromPath(
        resolveLocalD1SqlitePath(persistRoot),
      );

      const goldenPersist = mkdtempSync(join(tmpdir(), "physio-d1-golden-"));
      try {
        applyLocalMigrations(goldenPersist, fullConfig);
        const goldenSchema = captureApplicationSchemaFromPath(
          resolveLocalD1SqlitePath(goldenPersist),
        );
        expectSchemasEqual(outOfOrderSchema, goldenSchema);
      } finally {
        rmSync(goldenPersist, { recursive: true, force: true });
      }
    } finally {
      rmSync(persistRoot, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
    }
  }, 180_000);
});
