import Database from "better-sqlite3";
import type {
  PhysioD1BatchStatement,
  PhysioD1Database,
} from "../../src/adapters/workers/d1-sql-storage.js";
import type { SqlValue } from "../../src/storage/ports/sql-storage.js";

function normalizeBinding(value: SqlValue): SqlValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

/**
 * In-process D1 test double backed by SQLite. Supports atomic db.batch like production D1.
 */
export function createFakePhysioD1Database(): PhysioD1Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  return {
    prepare(query: string) {
      const stmt = db.prepare(query);
      return {
        bind(...values: SqlValue[]) {
          const bound = values.map(normalizeBinding);
          return {
            run(): Promise<{ meta: { changes?: number } }> {
              const result = stmt.run(...bound);
              return Promise.resolve({ meta: { changes: result.changes } });
            },
            all(): Promise<{ results?: Record<string, SqlValue>[] }> {
              const results = stmt.all(...bound) as Record<string, SqlValue>[];
              return Promise.resolve({ results });
            },
            first(): Promise<Record<string, SqlValue> | null> {
              const row = stmt.get(...bound) as Record<string, SqlValue> | undefined;
              return Promise.resolve(row ?? null);
            },
          };
        },
      };
    },
    async batch(statements: PhysioD1BatchStatement[]) {
      const runBatch = db.transaction(() => {
        const results: { meta: { changes?: number } }[] = [];
        for (const statement of statements) {
          const stmt = db.prepare(statement.sql);
          const result = stmt.run(...(statement.args ?? []).map(normalizeBinding));
          results.push({ meta: { changes: result.changes } });
        }
        return results;
      });
      return runBatch();
    },
  };
}

/** Runs semicolon-separated SQL on the fake D1 double (not batched). */
export async function runFakeD1Statements(
  db: PhysioD1Database,
  sql: string,
): Promise<void> {
  const parts = sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith("--"));
  for (const part of parts) {
    await db.prepare(part).bind().run();
  }
}
