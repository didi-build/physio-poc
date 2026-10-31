import { expect } from "vitest";
import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";
import { SQL_BATCH_MIN_ROWS_GUARD_TABLE } from "../../src/storage/sql-batch-min-rows-guard.js";

const APPROVE_ATOMICITY_TABLES = [
  "exercise_requests",
  "exercise_versions",
  "practitioner_exercises",
  "program_rows",
  "programs",
] as const;

export type ExerciseRequestMergeSnapshot = {
  requestNote: string | null;
  requestUpdatedAt: string;
  aliasCount: number;
  versionStatus: string | null;
  practitionerExerciseCount: number;
};

export async function snapshotExerciseRequestMergeState(
  sql: SqlStoragePort,
  requestId: string,
  exerciseId: string | null,
): Promise<ExerciseRequestMergeSnapshot> {
  const request = await sql.first<{ note: string | null; updated_at: string }>(
    "SELECT note, updated_at FROM exercise_requests WHERE id = ?",
    [requestId],
  );
  const aliasRow = await sql.first<{ count: number }>(
    "SELECT COUNT(*) AS count FROM exercise_aliases",
  );
  let versionStatus: string | null = null;
  if (exerciseId) {
    const version = await sql.first<{ status: string }>(
      `SELECT status FROM exercise_versions WHERE exercise_id = ? ORDER BY version_number DESC LIMIT 1`,
      [exerciseId],
    );
    versionStatus = version?.status ?? null;
  }
  const peRow = await sql.first<{ count: number }>(
    "SELECT COUNT(*) AS count FROM practitioner_exercises",
  );
  return {
    requestNote: request?.note ?? null,
    requestUpdatedAt: request?.updated_at ?? "",
    aliasCount: aliasRow?.count ?? 0,
    versionStatus,
    practitionerExerciseCount: peRow?.count ?? 0,
  };
}

export type ApproveGuardSnapshot = {
  requestStatus: string | null;
  versionStatus: string | null;
  practitionerExerciseCount: number;
  programRowLinkedCount: number;
};

export async function snapshotApproveGuardState(
  sql: SqlStoragePort,
  requestId: string,
  versionId: string,
  programRowId?: string,
): Promise<ApproveGuardSnapshot> {
  const request = await sql.first<{ status: string }>(
    "SELECT status FROM exercise_requests WHERE id = ?",
    [requestId],
  );
  const version = await sql.first<{ status: string }>(
    "SELECT status FROM exercise_versions WHERE id = ?",
    [versionId],
  );
  const pe = await sql.first<{ count: number }>(
    "SELECT COUNT(*) AS count FROM practitioner_exercises",
  );
  let programRowLinkedCount = 0;
  if (programRowId) {
    const row = await sql.first<{ exercise_version_id: string | null }>(
      "SELECT exercise_version_id FROM program_rows WHERE id = ?",
      [programRowId],
    );
    programRowLinkedCount = row?.exercise_version_id ? 1 : 0;
  }
  return {
    requestStatus: request?.status ?? null,
    versionStatus: version?.status ?? null,
    practitionerExerciseCount: pe?.count ?? 0,
    programRowLinkedCount,
  };
}

export async function snapshotApproveAtomicityTables(
  sql: SqlStoragePort,
): Promise<string> {
  const chunks: string[] = [];
  for (const table of APPROVE_ATOMICITY_TABLES) {
    const rows = await sql.all(`SELECT * FROM ${table} ORDER BY rowid`);
    chunks.push(JSON.stringify(rows));
  }
  const guardRows = await sql.all(`SELECT * FROM ${SQL_BATCH_MIN_ROWS_GUARD_TABLE}`);
  chunks.push(JSON.stringify(guardRows));
  return chunks.join("\n");
}

export async function expectSqlBatchGuardTableEmpty(
  sql: SqlStoragePort,
): Promise<void> {
  const guardRows = await sql.all(`SELECT * FROM ${SQL_BATCH_MIN_ROWS_GUARD_TABLE}`);
  expect(guardRows).toEqual([]);
}
