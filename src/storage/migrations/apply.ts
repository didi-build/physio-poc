import type { SqlStoragePort } from "../ports/sql-storage.js";

/** See src/storage/migrations/README.md (Node test runner only; not used on Workers/D1). */
export const MIGRATION_0001_ID = "0001_exercise_data_model";
export const MIGRATION_0002_ID = "0002_program_data_model";
export const MIGRATION_0003_ID = "0003_exercise_media";
export const MIGRATION_0004_ID = "0004_better_auth";
export const MIGRATION_0005_ID = "0005_auth_practitioner_binding";

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

  await storage.run("BEGIN");
  try {
    for (const statement of splitSqlStatements(sql)) {
      await storage.run(statement);
    }
    await storage.run("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [
      migrationId,
      new Date().toISOString(),
    ]);
    await storage.run("COMMIT");
  } catch (error) {
    try {
      await storage.run("ROLLBACK");
    } catch {
      // Rollback may fail if the adapter does not support transactions.
    }
    throw error;
  }
}
