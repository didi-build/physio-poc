import type {
  SqlBindings,
  SqlRunResult,
  SqlStoragePort,
  SqlValue,
} from "../../ports/sql-storage.js";
import { SqlDuplicateIdError } from "../../errors/sql-duplicate-id-error.js";

type Row = Record<string, SqlValue>;

function normalizeStoredValue(value: SqlValue): SqlValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

function copyRow(row: Row): Row {
  const copy: Row = {};
  for (const [key, value] of Object.entries(row)) {
    copy[key] = value;
  }
  return copy;
}

function parseSelectWhere(
  normalized: string,
): { tableName: string; column: string; limitOne: boolean } | null {
  const match = /^SELECT .+ FROM (\w+) WHERE (\w+) = \?(?: LIMIT 1)?$/i.exec(
    normalized,
  );
  if (match) {
    return {
      tableName: match[1],
      column: match[2],
      limitOne: /LIMIT 1$/i.test(normalized),
    };
  }
  return null;
}

/**
 * Plain TypeScript fake for tests. Not SQLite; DIDI-997 adds better-sqlite3 for real SQL tests.
 * BEGIN/COMMIT/ROLLBACK are no-ops: there is no atomicity or rollback (see src/storage/migrations/README.md).
 * first() accepts only SELECT ... WHERE ... = ? LIMIT 1; all() accepts the same shape without LIMIT 1.
 */
export class InMemorySqlStorage implements SqlStoragePort {
  private readonly tables = new Map<string, Row[]>();

  async run(sql: string, bindings: SqlBindings = []): Promise<SqlRunResult> {
    const normalized = sql.trim().replace(/\s+/g, " ");
    if (/^BEGIN$/i.test(normalized)) {
      return { rowsAffected: 0 };
    }
    if (/^COMMIT$/i.test(normalized) || /^ROLLBACK$/i.test(normalized)) {
      return { rowsAffected: 0 };
    }
    const insertMatch = /^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)$/i.exec(
      normalized,
    );
    if (insertMatch) {
      const tableName = insertMatch[1];
      const columns = insertMatch[2].split(",").map((c) => c.trim());
      const placeholders = insertMatch[3].split(",").map((c) => c.trim());
      if (
        columns.length !== placeholders.length ||
        columns.length !== bindings.length
      ) {
        throw new Error("INSERT column count must match bindings");
      }
      for (const placeholder of placeholders) {
        if (placeholder !== "?") {
          throw new Error("Only ? placeholders are supported in in-memory SQL");
        }
      }
      const row: Row = {};
      columns.forEach((column, index) => {
        row[column] = normalizeStoredValue(bindings[index] ?? null);
      });
      const table = this.tables.get(tableName) ?? [];
      const idColumn = columns.indexOf("id");
      if (idColumn >= 0) {
        const idValue = row.id;
        if (idValue !== null && idValue !== undefined) {
          const duplicate = table.some((existing) => existing.id === idValue);
          if (duplicate) {
            if (tableName === "programs") {
              throw new SqlDuplicateIdError(tableName, String(idValue));
            }
            throw new Error(`Duplicate id in ${tableName}: ${String(idValue)}`);
          }
        }
      }
      table.push(row);
      this.tables.set(tableName, table);
      return { rowsAffected: 1 };
    }

    throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
  }

  async all<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T[]> {
    const parsed = parseSelectWhere(sql.trim().replace(/\s+/g, " "));
    if (!parsed || parsed.limitOne) {
      throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
    }
    return this.matchRows<T>(parsed.tableName, parsed.column, bindings[0]);
  }

  async first<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T | null> {
    const parsed = parseSelectWhere(sql.trim().replace(/\s+/g, " "));
    if (!parsed || !parsed.limitOne) {
      throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
    }
    const rows = this.matchRows<T>(parsed.tableName, parsed.column, bindings[0]);
    return rows[0] ?? null;
  }

  private matchRows<T extends Record<string, SqlValue>>(
    tableName: string,
    column: string,
    needle: SqlValue | undefined,
  ): T[] {
    const table = this.tables.get(tableName) ?? [];
    return table
      .filter((row) => row[column] === needle)
      .map((row) => copyRow(row) as T);
  }
}
