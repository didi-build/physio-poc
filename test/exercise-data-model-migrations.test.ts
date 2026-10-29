import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BetterSqliteStorage,
  NestedSqlTransactionError,
} from "../src/adapters/node/better-sqlite-sql-storage.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../src/domain/global-type-defaults-seed.js";
import { applyMigration, MIGRATION_0001_ID } from "../src/storage/migrations/apply.js";
import { BodyRegionsRepository } from "../src/storage/repositories/exercise-data.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const MIGRATION_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0001_exercise_data_model.sql"),
  "utf8",
);

describe("exercise data model migrations (integration, SQLite)", () => {
  it("applies 0001 from empty and seeds body regions and global type defaults", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_SQL);
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_SQL);

      const migrations = await storage.all<{ id: string }>(
        "SELECT id FROM schema_migrations",
      );
      expect(migrations).toHaveLength(1);

      const regions = await new BodyRegionsRepository(storage).listAll();
      expect(regions.map((r) => r.label).sort()).toEqual(["ankle", "hip", "knee"]);

      const defaults = await new TypeDefaultsRepository(storage).listGlobalDefaults();
      expect(defaults).toEqual(GLOBAL_TYPE_DEFAULTS_SEED);
    } finally {
      storage.close();
    }
  });

  it("rolls back and records nothing when a statement fails", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await storage.run(
        "CREATE TABLE schema_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)",
      );
      const failingSql = `
        CREATE TABLE migration_probe (id TEXT PRIMARY KEY NOT NULL);
        INSERT INTO migration_probe (id) VALUES ('ok');
        INSERT INTO no_such_table (id) VALUES ('fail');
      `;
      await expect(
        applyMigration(storage, "failed_probe", failingSql),
      ).rejects.toThrow();

      const migrations = await storage.all<{ id: string }>(
        "SELECT id FROM schema_migrations",
      );
      expect(migrations).toHaveLength(0);

      const probe = await storage.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_probe'",
      );
      expect(probe).toHaveLength(0);
    } finally {
      storage.close();
    }
  });

  it("tracks transaction depth for BEGIN, COMMIT, and ROLLBACK", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await storage.run("BEGIN");
      await expect(storage.run("BEGIN")).rejects.toThrow(NestedSqlTransactionError);
      await storage.run("ROLLBACK");

      await storage.run("BEGIN");
      await storage.run("COMMIT");
      await storage.run("BEGIN");
      await storage.run("ROLLBACK");
      await storage.run("BEGIN");
      await storage.run("COMMIT");

      await expect(storage.run("COMMIT")).rejects.toThrow(NestedSqlTransactionError);
      await expect(storage.run("ROLLBACK")).rejects.toThrow(NestedSqlTransactionError);
    } finally {
      storage.close();
    }
  });
});
