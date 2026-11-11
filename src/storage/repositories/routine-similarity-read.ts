import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import type { SqlStoragePort } from "../ports/sql-storage.js";

export type RoutineSimilarityCandidateRow = {
  routine_id: string;
  exercise_id: string;
};

const VISIBLE_CANDIDATE_VERSION_JOIN = `
  INNER JOIN routine_versions rv ON rv.routine_id = r.id
    AND (
      (
        r.published_version IS NOT NULL
        AND rv.status = 'published'
        AND rv.version_number = r.published_version
      )
      OR (
        r.published_version IS NULL
        AND rv.status = 'draft'
      )
    )
`;

export class RoutineSimilarityReadRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async listVisibleCandidateExerciseRows(
    viewerPractitionerId: string,
    excludeRoutineId?: string,
  ): Promise<RoutineSimilarityCandidateRow[]> {
    const viewer = validateOpaqueEntityId(viewerPractitionerId, "Practitioner id");
    const bindings: string[] = [viewer, viewer];
    let excludeSql = "";
    if (excludeRoutineId) {
      excludeSql = " AND r.id <> ?";
      bindings.push(validateOpaqueEntityId(excludeRoutineId, "Routine id"));
    }
    return this.sql.all<RoutineSimilarityCandidateRow>(
      `SELECT r.id AS routine_id, rvr.exercise_id
       FROM routines r
       ${VISIBLE_CANDIDATE_VERSION_JOIN}
       INNER JOIN routine_version_rows rvr ON rvr.routine_version_id = rv.id
       WHERE (r.published_version IS NOT NULL OR r.created_by = ?)
         AND NOT (r.published_version IS NULL AND r.created_by <> ?)${excludeSql}`,
      bindings,
    );
  }

  async listConditionIdsByRoutineIds(
    routineIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (routineIds.length === 0) {
      return map;
    }
    const placeholders = routineIds.map(() => "?").join(", ");
    const normalized = routineIds.map((id) => validateOpaqueEntityId(id, "Routine id"));
    const rows = await this.sql.all<{ routine_id: string; condition_id: string }>(
      `SELECT routine_id, condition_id
       FROM routine_conditions
       WHERE routine_id IN (${placeholders})
       ORDER BY routine_id ASC, condition_id ASC`,
      normalized,
    );
    for (const row of rows) {
      const existing = map.get(row.routine_id);
      if (existing) {
        existing.push(row.condition_id);
      } else {
        map.set(row.routine_id, [row.condition_id]);
      }
    }
    return map;
  }

  async listExerciseIdsForVisibleRoutine(
    practitionerId: string,
    routineId: string,
  ): Promise<string[] | null> {
    const viewer = validateOpaqueEntityId(practitionerId, "Practitioner id");
    const rid = validateOpaqueEntityId(routineId, "Routine id");
    const visible = await this.sql.first<{ id: string }>(
      `SELECT r.id
       FROM routines r
       WHERE r.id = ?
         AND (r.published_version IS NOT NULL OR r.created_by = ?)
         AND NOT (r.published_version IS NULL AND r.created_by <> ?)
       LIMIT 1`,
      [rid, viewer, viewer],
    );
    if (!visible) {
      return null;
    }
    const rows = await this.sql.all<{ exercise_id: string }>(
      `SELECT rvr.exercise_id
       FROM routines r
       ${VISIBLE_CANDIDATE_VERSION_JOIN}
       INNER JOIN routine_version_rows rvr ON rvr.routine_version_id = rv.id
       WHERE r.id = ?
       ORDER BY rvr.position ASC`,
      [rid],
    );
    return rows.map((row) => row.exercise_id);
  }
}
