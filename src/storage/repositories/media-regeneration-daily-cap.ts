import type { SqlStoragePort } from "../ports/sql-storage.js";
import type { MediaRegenerationScope } from "./exercise-media.js";

/**
 * Single-statement daily cap consume for practitioner UTC day windows (DIDI-1081).
 * Inserts the audit row only when today's count is strictly below {@link dailyCap}.
 * Reusable for other per-practitioner daily counters (e.g. DIDI-1214).
 */
export const MEDIA_REGENERATION_INSERT_UNDER_DAILY_CAP_SQL = `INSERT INTO media_regenerations (
  id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
)
SELECT ?, ?, ?, ?, ?, ?, ?
WHERE (
  SELECT COUNT(*) FROM media_regenerations AS cap_count
  WHERE cap_count.practitioner_id = ?
    AND cap_count.created_at >= ?
    AND cap_count.created_at < ?
) < ?`;

export type MediaRegenerationDailyCapInsert = {
  id: string;
  practitionerId: string;
  exerciseId: string;
  exerciseVersionId: string | null;
  scope: MediaRegenerationScope;
  hadNote: boolean;
  createdAt: string;
};

export async function tryInsertMediaRegenerationUnderDailyCap(
  sql: SqlStoragePort,
  input: MediaRegenerationDailyCapInsert,
  utcDayStartIso: string,
  utcDayEndIso: string,
  dailyCap: number,
): Promise<boolean> {
  const result = await sql.run(MEDIA_REGENERATION_INSERT_UNDER_DAILY_CAP_SQL, [
    input.id,
    input.practitionerId,
    input.exerciseId,
    input.exerciseVersionId,
    input.scope,
    input.hadNote ? 1 : 0,
    input.createdAt,
    input.practitionerId,
    utcDayStartIso,
    utcDayEndIso,
    dailyCap,
  ]);
  return result.rowsAffected > 0;
}
