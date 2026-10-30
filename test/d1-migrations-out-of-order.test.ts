import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");
const WRANGLER_BIN = join(REPO_ROOT, "node_modules/wrangler/bin/wrangler.js");
const D1_DATABASE_NAME = "physio-poc-migrations-test";
const D1_BINDING_CONFIG = join(REPO_ROOT, "wrangler.d1-migrations-test.jsonc");

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

function queryD1(persistTo: string, configPath: string, sql: string): unknown[] {
  const result = runWrangler(
    ["d1", "execute", D1_DATABASE_NAME, "--command", sql, "--json"],
    { persistTo, configPath },
  );
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  const parsed = JSON.parse(result.stdout) as Array<{ results: unknown[] }>;
  return parsed[0]?.results ?? [];
}

function listTableNames(persistTo: string, configPath: string): string[] {
  const rows = queryD1(
    persistTo,
    configPath,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ) as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function listAppliedMigrationNames(persistTo: string, configPath: string): string[] {
  const rows = queryD1(
    persistTo,
    configPath,
    "SELECT name FROM d1_migrations ORDER BY id",
  ) as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

describe("D1 wrangler migrations out-of-order landing (integration, local D1)", () => {
  it("applies 0003 and 0004 after 0005 and matches in-order schema", () => {
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

      const afterPhase1 = listAppliedMigrationNames(persistRoot, phase1Config);
      expect(afterPhase1).toEqual([...PHASE1_MIGRATION_FILES]);

      applyLocalMigrations(persistRoot, fullConfig);

      const applied = listAppliedMigrationNames(persistRoot, fullConfig);
      expect(applied).toHaveLength(EXPECTED_MIGRATION_FILES.length);
      expect([...applied].sort()).toEqual([...EXPECTED_MIGRATION_FILES].sort());

      const goldenPersist = mkdtempSync(join(tmpdir(), "physio-d1-golden-"));
      try {
        applyLocalMigrations(goldenPersist, fullConfig);
        const outOfOrderTables = listTableNames(persistRoot, fullConfig);
        const goldenTables = listTableNames(goldenPersist, fullConfig);
        expect(outOfOrderTables).toEqual(goldenTables);
      } finally {
        rmSync(goldenPersist, { recursive: true, force: true });
      }

      const mediaTables = queryD1(
        persistRoot,
        fullConfig,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('exercise_media_sets', 'media_regenerations') ORDER BY name",
      ) as Array<{ name: string }>;
      expect(mediaTables.map((row) => row.name)).toEqual([
        "exercise_media_sets",
        "media_regenerations",
      ]);

      const authTables = queryD1(
        persistRoot,
        fullConfig,
        'SELECT name FROM sqlite_master WHERE type = \'table\' AND name IN ("user", "session", "account", "verification") ORDER BY name',
      ) as Array<{ name: string }>;
      expect(authTables.map((row) => row.name)).toEqual([
        "account",
        "session",
        "user",
        "verification",
      ]);
    } finally {
      rmSync(persistRoot, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("documents the harness wrangler config used for local D1 only", () => {
    const text = readFileSync(D1_BINDING_CONFIG, "utf8");
    expect(text).toContain(D1_DATABASE_NAME);
    expect(text).toContain('"migrations_dir"');
    expect(text).not.toContain("--remote");
  });
});
