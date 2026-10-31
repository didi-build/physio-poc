import type { SqlBatchStatement, SqlStoragePort } from "../ports/sql-storage.js";

/** See src/storage/migrations/README.md (Node test runner only; not used on Workers/D1). */
export const MIGRATION_0001_ID = "0001_exercise_data_model";
export const MIGRATION_0002_ID = "0002_program_data_model";
export const MIGRATION_0003_ID = "0003_exercise_media";
export const MIGRATION_0004_ID = "0004_better_auth";
export const MIGRATION_0005_ID = "0005_routine_data_model";
export const MIGRATION_0006_ID = "0006_mcp_oauth";

export function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export async function applyMigration(
  storage: SqlStoragePort,
  migrationId: string,
  sql: string,
): Promise<void> {
  let existing: { id: string } | null = null;
  try {
    existing = await storage.first<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = ? LIMIT 1",
      [migrationId],
    );
  } catch {
    existing = null;
  }
  if (existing) {
    return;
  }

  const statements: SqlBatchStatement[] = [
    ...splitSqlStatements(sql).map((statement) => ({ sql: statement })),
    {
      sql: "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
      bindings: [migrationId, new Date().toISOString()],
    },
  ];
  await storage.batch(statements);
}
