/** D1-compatible values. Boolean bindings are stored and read as 1 or 0 in adapters. */
export type SqlValue = string | number | boolean | null;

export type SqlBindings = readonly SqlValue[];

export type SqlRunResult = {
  rowsAffected: number;
};

export type SqlBatchStatement = {
  sql: string;
  bindings?: SqlBindings;
  /** When set, the batch fails if rowsAffected is less than this value. */
  minRowsAffected?: number;
};

/**
 * SQLite-compatible SQL access. Implementations map to D1, better-sqlite3, or Postgres adapters later.
 */
export interface SqlStoragePort {
  run(sql: string, bindings?: SqlBindings): Promise<SqlRunResult>;
  all<T extends Record<string, SqlValue>>(
    sql: string,
    bindings?: SqlBindings,
  ): Promise<T[]>;
  first<T extends Record<string, SqlValue>>(
    sql: string,
    bindings?: SqlBindings,
  ): Promise<T | null>;
  /**
   * Applies every statement atomically, or rolls back all changes on failure.
   */
  batch(statements: readonly SqlBatchStatement[]): Promise<void>;
}
