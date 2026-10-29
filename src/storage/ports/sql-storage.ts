export type SqlValue = string | number | boolean | null;

export type SqlBindings = readonly SqlValue[];

export type SqlRunResult = {
  rowsAffected: number;
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
}
