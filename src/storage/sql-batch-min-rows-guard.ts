import type { SqlBatchStatement, SqlValue } from "./ports/sql-storage.js";

export const SQL_BATCH_MIN_ROWS_GUARD_TABLE = "__sql_batch_min_rows_guard";

/** Named CHECK on the guard table; failed guards must mention this in adapter errors. */
export const SQL_BATCH_MIN_ROWS_GUARD_CHECK = "sql_batch_min_rows_guard_failed";

/**
 * Insert only when the previous statement changed too few rows; CHECK (0) then aborts the batch.
 */
export const SQL_BATCH_MIN_ROWS_GUARD_SQL = `INSERT INTO ${SQL_BATCH_MIN_ROWS_GUARD_TABLE} (v) SELECT 1 WHERE abs(changes()) < ?`;

export type ExpandedSqlBatchStatement = {
  sql: string;
  bindings: SqlValue[];
};

export function expandSqlBatchStatementsWithMinRowsGuards(
  statements: readonly SqlBatchStatement[],
): ExpandedSqlBatchStatement[] {
  const expanded: ExpandedSqlBatchStatement[] = [];
  for (const statement of statements) {
    expanded.push({
      sql: statement.sql,
      bindings: [...(statement.bindings ?? [])],
    });
    if (statement.minRowsAffected !== undefined) {
      expanded.push({
        sql: SQL_BATCH_MIN_ROWS_GUARD_SQL,
        bindings: [statement.minRowsAffected],
      });
    }
  }
  return expanded;
}

export function isSqlBatchGuardAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes(SQL_BATCH_MIN_ROWS_GUARD_CHECK);
}
