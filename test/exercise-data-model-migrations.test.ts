import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
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
});
