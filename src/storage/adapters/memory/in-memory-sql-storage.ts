import type {
  SqlBindings,
  SqlRunResult,
  SqlStoragePort,
  SqlValue,
} from "../../ports/sql-storage.js";

type Row = Record<string, SqlValue>;

/**
 * Minimal in-memory SQL adapter for tests. Supports simple INSERT and SELECT with positional ? bindings.
 */
export class InMemorySqlStorage implements SqlStoragePort {
  private readonly tables = new Map<string, Row[]>();

  async run(sql: string, bindings: SqlBindings = []): Promise<SqlRunResult> {
    const normalized = sql.trim().replace(/\s+/g, " ");
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
        row[column] = bindings[index] ?? null;
      });
      const table = this.tables.get(tableName) ?? [];
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
    const row = await this.first<T>(sql, bindings);
    return row ? [row] : [];
  }

  async first<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T | null> {
    const normalized = sql.trim().replace(/\s+/g, " ");
    const selectMatch = /^SELECT \* FROM (\w+) WHERE (\w+) = \? LIMIT 1$/i.exec(
      normalized,
    );
    if (selectMatch) {
      const tableName = selectMatch[1];
      const column = selectMatch[2];
      const needle = bindings[0];
      const table = this.tables.get(tableName) ?? [];
      const found = table.find((row) => row[column] === needle);
      return (found as T | undefined) ?? null;
    }

    throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
  }
}
