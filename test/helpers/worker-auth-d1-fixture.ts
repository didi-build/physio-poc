import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import {
  applyMigration,
  MIGRATION_0004_ID,
  MIGRATION_0006_ID,
} from "../../src/storage/migrations/apply.js";
import type { PhysioD1Database } from "../../src/adapters/workers/d1-sql-storage.js";
import { openMigratedDatabase, seedPractitioner } from "./exercise-sqlite-fixture.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const MIGRATION_0004_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0004_better_auth.sql"),
  "utf8",
);
const MIGRATION_0006_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0006_mcp_oauth.sql"),
  "utf8",
);

/** In-memory D1 binding backed by better-sqlite3 for Worker auth integration tests. */
export function d1DatabaseFromSqlite(native: Database.Database): PhysioD1Database {
  const binding = {
    prepare(query: string) {
      const stmt = native.prepare(query);
      let boundValues: unknown[] = [];
      const prepared = {
        bind(...values: unknown[]) {
          boundValues = values;
          return prepared;
        },
        run: async () => {
          const info = stmt.run(...boundValues);
          return {
            meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
          };
        },
        all: async () => ({
          results: stmt.all(...boundValues) as Record<string, unknown>[],
          meta: { changes: 0, last_row_id: 0 },
        }),
        first: async () =>
          (stmt.get(...boundValues) as Record<string, unknown> | undefined) ?? null,
      };
      return prepared;
    },
    batch: async (statements: Array<{ all(): Promise<unknown> }>) =>
      Promise.all(statements.map((statement) => statement.all())),
    exec: async (query: string) => {
      native.exec(query);
    },
  };
  return binding as unknown as PhysioD1Database;
}

export async function openWorkerAuthTestDatabase(): Promise<{
  d1: PhysioD1Database;
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>;
}> {
  const storage = await openMigratedDatabase();
  await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
  await applyMigration(storage, MIGRATION_0006_ID, MIGRATION_0006_SQL);
  return {
    d1: d1DatabaseFromSqlite(storage.nativeDatabase()),
    storage,
  };
}

export { seedPractitioner };
