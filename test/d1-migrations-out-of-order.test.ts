import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
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
  "0007_sql_batch_min_rows_guard.sql",
  "0008_routine_draft_discards.sql",
  "0009_routine_conditions.sql",
  "0011_exercise_version_pending_media.sql",
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

const MIGRATION_PREFIX_0009 = [
  "0001_exercise_data_model.sql",
  "0002_program_data_model.sql",
  "0003_exercise_media.sql",
  "0004_better_auth.sql",
  "0005_routine_data_model.sql",
  "0006_mcp_oauth.sql",
  "0007_sql_batch_min_rows_guard.sql",
  "0008_routine_draft_discards.sql",
  "0009_routine_conditions.sql",
] as const;

function materializeMigrationsDir(targetDir: string, keep: readonly string[]): void {
  rmSync(targetDir, { recursive: true, force: true });
  cpSync(join(REPO_ROOT, "migrations"), targetDir, { recursive: true });
  for (const name of readdirSync(targetDir)) {
    if (!keep.includes(name as (typeof keep)[number])) {
      rmSync(join(targetDir, name));
    }
  }
}

describe("D1 migration 0011 pending media columns (MIG3)", () => {
  it("leaves pending_media_set_id and pending_media_requested_by null on rows created before 0011", () => {
    const persistRoot = mkdtempSync(join(tmpdir(), "physio-d1-mig11-"));
    const configDir = mkdtempSync(join(tmpdir(), "physio-d1-mig11-cfg-"));
    const phase9MigrationsDir = join(configDir, "phase9-migrations");
    const phase9Config = join(configDir, "phase9.jsonc");
    const fullConfig = join(configDir, "full.jsonc");
    const ts = "2026-01-01T00:00:00.000Z";
    const liveMediaSetId = "media-set-mig3-live";
    const versionNullMediaId = "ver-mig3-null-media";
    const versionLiveMediaId = "ver-mig3-live-media";

    materializeMigrationsDir(phase9MigrationsDir, MIGRATION_PREFIX_0009);
    writeWranglerConfig(phase9MigrationsDir, phase9Config);
    writeWranglerConfig(join(REPO_ROOT, "migrations"), fullConfig);

    try {
      applyLocalMigrations(persistRoot, phase9Config);

      const sqlitePath = resolveLocalD1SqlitePath(persistRoot);
      const native = new Database(sqlitePath);
      native
        .prepare(`INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)`)
        .run("prac-mig3", "prac-mig3@example.com", ts);
      native
        .prepare(
          `INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)`,
        )
        .run("ex-mig3-null", "stretch", "prac-mig3", ts);
      native
        .prepare(
          `INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)`,
        )
        .run("ex-mig3-live", "stretch", "prac-mig3", ts);
      native
        .prepare(
          `INSERT INTO exercise_media_sets (
            id, start_object_key, end_object_key, start_provider_url, visibility, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          liveMediaSetId,
          `media-sets/${liveMediaSetId}/start.png`,
          `media-sets/${liveMediaSetId}/end.png`,
          null,
          "public",
          ts,
        );
      native
        .prepare(
          `INSERT INTO exercise_versions (
            id, exercise_id, version_number, status, title, starting_position, steps, created_at
          ) VALUES (?, ?, 1, 'draft', 'No media', 'Supine', '[]', ?)`,
        )
        .run(versionNullMediaId, "ex-mig3-null", ts);
      native
        .prepare(
          `INSERT INTO exercise_versions (
            id, exercise_id, version_number, status, title, starting_position, steps,
            media_set_id, created_at
          ) VALUES (?, ?, 1, 'draft', 'Live media', 'Supine', '[]', ?, ?)`,
        )
        .run(versionLiveMediaId, "ex-mig3-live", liveMediaSetId, ts);
      native.close();

      applyLocalMigrations(persistRoot, fullConfig);

      const afterNative = new Database(sqlitePath);
      const rowNullMedia = afterNative
        .prepare(
          `SELECT media_set_id, pending_media_set_id, pending_media_requested_by
           FROM exercise_versions WHERE id = ?`,
        )
        .get(versionNullMediaId) as {
        media_set_id: string | null;
        pending_media_set_id: string | null;
        pending_media_requested_by: string | null;
      };
      const rowLiveMedia = afterNative
        .prepare(
          `SELECT media_set_id, pending_media_set_id, pending_media_requested_by
           FROM exercise_versions WHERE id = ?`,
        )
        .get(versionLiveMediaId) as {
        media_set_id: string | null;
        pending_media_set_id: string | null;
        pending_media_requested_by: string | null;
      };
      afterNative.close();

      expect(rowNullMedia.media_set_id).toBeNull();
      expect(rowNullMedia.pending_media_set_id).toBeNull();
      expect(rowNullMedia.pending_media_requested_by).toBeNull();
      expect(rowLiveMedia.media_set_id).toBe(liveMediaSetId);
      expect(rowLiveMedia.pending_media_set_id).toBeNull();
      expect(rowLiveMedia.pending_media_requested_by).toBeNull();
    } finally {
      rmSync(persistRoot, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
    }
  }, 180_000);
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
