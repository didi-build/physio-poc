import { SqlDuplicateIdError } from "../../storage/errors/sql-duplicate-id-error.js";
import { SqlBatchGuardError } from "../../storage/errors/sql-batch-error.js";
import type {
  SqlBatchStatement,
  SqlBindings,
  SqlRunResult,
  SqlStoragePort,
  SqlValue,
} from "../../storage/ports/sql-storage.js";

/** Minimal D1 binding surface used by the Workers entry. */
export type PhysioD1BatchStatement = {
  sql: string;
  args?: SqlValue[];
};

export type PhysioD1Database = {
  prepare(query: string): {
    bind(...values: SqlValue[]): {
      run(): Promise<{ meta: { changes?: number } }>;
      all(): Promise<{ results?: Record<string, SqlValue>[] }>;
      first(): Promise<Record<string, SqlValue> | null>;
    };
  };
  batch(
    statements: PhysioD1BatchStatement[],
  ): Promise<{ meta: { changes?: number } }[]>;
};

function normalizeBinding(value: SqlValue): SqlValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

function mapD1UniqueIdConstraint(error: unknown): unknown {
  if (error instanceof Error) {
    const tableMatch =
      /^D1_ERROR: UNIQUE constraint failed: (\w+)\.id/.exec(error.message) ??
      /^UNIQUE constraint failed: (\w+)\.id/.exec(error.message);
    if (tableMatch && tableMatch[1] === "programs") {
      return new SqlDuplicateIdError(tableMatch[1]);
    }
  }
  return error;
}

/**
 * D1-backed SqlStoragePort for the Workers entry (production binding).
 */
export class D1SqlStorage implements SqlStoragePort {
  constructor(private readonly db: PhysioD1Database | undefined) {}

  private requireDb(): PhysioD1Database {
    if (!this.db) {
      throw new Error("PHYSIO_DB binding is missing");
    }
    return this.db;
  }

  async run(sql: string, bindings: SqlBindings = []): Promise<SqlRunResult> {
    const stmt = this.requireDb().prepare(sql);
    try {
      const result = await stmt.bind(...bindings.map(normalizeBinding)).run();
      return { rowsAffected: result.meta.changes ?? 0 };
    } catch (error) {
      throw mapD1UniqueIdConstraint(error);
    }
  }

  async all<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T[]> {
    const stmt = this.requireDb().prepare(sql);
    try {
      const result = await stmt.bind(...bindings.map(normalizeBinding)).all();
      return (result.results ?? []) as T[];
    } catch (error) {
      throw mapD1UniqueIdConstraint(error);
    }
  }

  async first<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T | null> {
    const stmt = this.requireDb().prepare(sql);
    try {
      const row = await stmt.bind(...bindings.map(normalizeBinding)).first();
      return (row as T | null) ?? null;
    } catch (error) {
      throw mapD1UniqueIdConstraint(error);
    }
  }

  async batch(statements: readonly SqlBatchStatement[]): Promise<void> {
    if (statements.length === 0) {
      return;
    }
    const db = this.requireDb();
    try {
      const results = await db.batch(
        statements.map((statement) => ({
          sql: statement.sql,
          args: [...(statement.bindings ?? []).map(normalizeBinding)],
        })),
      );
      for (let index = 0; index < statements.length; index += 1) {
        const minRows = statements[index]?.minRowsAffected;
        if (minRows === undefined) {
          continue;
        }
        const changes = results[index]?.meta?.changes ?? 0;
        if (changes < minRows) {
          throw new SqlBatchGuardError();
        }
      }
    } catch (error) {
      if (error instanceof SqlBatchGuardError) {
        throw error;
      }
      throw mapD1UniqueIdConstraint(error);
    }
  }
}
