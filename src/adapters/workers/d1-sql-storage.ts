import { SqlDuplicateIdError } from "../../storage/errors/sql-duplicate-id-error.js";
import { SqlBatchGuardError } from "../../storage/errors/sql-batch-error.js";
import {
  expandSqlBatchStatementsWithMinRowsGuards,
  isSqlBatchGuardAbortError,
} from "../../storage/sql-batch-min-rows-guard.js";
import type {
  SqlBatchStatement,
  SqlBindings,
  SqlRunResult,
  SqlStoragePort,
  SqlValue,
} from "../../storage/ports/sql-storage.js";

export type PhysioD1PreparedStatement = {
  run(): Promise<{ meta: { changes?: number } }>;
  all(): Promise<{ results?: Record<string, SqlValue>[] }>;
  first(): Promise<Record<string, SqlValue> | null>;
};

/** Minimal D1 binding surface used by the Workers entry. */
export type PhysioD1Database = {
  prepare(query: string): {
    bind(...values: SqlValue[]): PhysioD1PreparedStatement;
  };
  batch(
    statements: PhysioD1PreparedStatement[],
  ): Promise<{ meta: { changes?: number } }[]>;
  exec?(query: string): Promise<unknown>;
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

function mapBatchError(error: unknown): unknown {
  if (error instanceof SqlBatchGuardError) {
    return error;
  }
  if (isSqlBatchGuardAbortError(error)) {
    return new SqlBatchGuardError();
  }
  return mapD1UniqueIdConstraint(error);
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
      throw mapBatchError(error);
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
      throw mapBatchError(error);
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
      throw mapBatchError(error);
    }
  }

  async batch(statements: readonly SqlBatchStatement[]): Promise<void> {
    if (statements.length === 0) {
      return;
    }
    const db = this.requireDb();
    const expanded = expandSqlBatchStatementsWithMinRowsGuards(statements);
    const prepared = expanded.map((statement) =>
      db.prepare(statement.sql).bind(...statement.bindings.map(normalizeBinding)),
    );
    try {
      await db.batch(prepared);
    } catch (error) {
      throw mapBatchError(error);
    }
  }
}
