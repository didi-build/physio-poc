import type { SqlBatchStatement, SqlValue } from "./ports/sql-storage.js";

export const SQL_BATCH_MIN_ROWS_GUARD_TABLE = "__sql_batch_min_rows_guard";

export const SQL_BATCH_MIN_ROWS_GUARD_ENSURE = `CREATE TABLE IF NOT EXISTS ${SQL_BATCH_MIN_ROWS_GUARD_TABLE} (v INTEGER NOT NULL)`;

/** Runs immediately after a write; NOT NULL insert fails when changes() is below the minimum. */
export const SQL_BATCH_MIN_ROWS_GUARD_SQL = `INSERT INTO ${SQL_BATCH_MIN_ROWS_GUARD_TABLE} (v) SELECT CASE WHEN abs(changes()) >= ? THEN 1 END`;

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
  if (error.message.includes("SQL batch statement matched fewer rows than required")) {
    return true;
  }
  if (
    error.message.includes(`${SQL_BATCH_MIN_ROWS_GUARD_TABLE}`) &&
    error.message.includes("NOT NULL constraint failed")
  ) {
    return true;
  }
  return error.message.includes("sql_batch_guard");
}
