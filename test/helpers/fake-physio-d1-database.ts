import Database from "better-sqlite3";
import type {
  PhysioD1Database,
  PhysioD1PreparedStatement,
} from "../../src/adapters/workers/d1-sql-storage.js";
import type { SqlValue } from "../../src/storage/ports/sql-storage.js";

const PHYSIO_D1_PREPARED = Symbol("PhysioD1PreparedStatement");

type MarkedPrepared = PhysioD1PreparedStatement & {
  [PHYSIO_D1_PREPARED]: true;
  __sqliteRun(): { meta: { changes?: number } };
};

function normalizeBinding(value: SqlValue): SqlValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

function markPrepared(statement: {
  __sqliteRun(): { meta: { changes?: number } };
  run(): Promise<{ meta: { changes?: number } }>;
  all(): Promise<{ results?: Record<string, SqlValue>[] }>;
  first(): Promise<Record<string, SqlValue> | null>;
}): MarkedPrepared {
  return Object.assign(statement, { [PHYSIO_D1_PREPARED]: true as const });
}

function assertPreparedStatement(
  statement: PhysioD1PreparedStatement,
): asserts statement is MarkedPrepared {
  if (
    typeof statement !== "object" ||
    statement === null ||
    !(PHYSIO_D1_PREPARED in statement)
  ) {
    throw new Error(
      "D1Database.batch requires prepared statements from db.prepare(sql).bind(...)",
    );
  }
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
          return markPrepared({
            __sqliteRun() {
              const result = stmt.run(...bound);
              return { meta: { changes: result.changes } };
            },
            run(): Promise<{ meta: { changes?: number } }> {
              return Promise.resolve(this.__sqliteRun());
            },
            all(): Promise<{ results?: Record<string, SqlValue>[] }> {
              const results = stmt.all(...bound) as Record<string, SqlValue>[];
              return Promise.resolve({ results });
            },
            first(): Promise<Record<string, SqlValue> | null> {
              const row = stmt.get(...bound) as Record<string, SqlValue> | undefined;
              return Promise.resolve(row ?? null);
            },
          });
        },
      };
    },
    async batch(statements: PhysioD1PreparedStatement[]) {
      for (const statement of statements) {
        assertPreparedStatement(statement);
      }
      const runBatch = db.transaction(() => {
        const results: { meta: { changes?: number } }[] = [];
        for (const statement of statements) {
          results.push((statement as MarkedPrepared).__sqliteRun());
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
