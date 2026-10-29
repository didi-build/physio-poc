import type { SqlBindings, SqlStoragePort, SqlValue } from "../ports/sql-storage.js";
import type { ExerciseCategory } from "../../domain/exercise-types.js";
import {
  prescriptionTypesForCategory,
  type PrescriptionType,
} from "../../domain/exercise-types.js";
import { likeContainsPattern } from "../../domain/sql-like.js";

const LIKE_ESCAPE_SQL = " ESCAPE '\\'";

export type ApprovedExerciseSearchSort = "most_used" | "newest" | "a_to_z";

export type ApprovedExerciseSearchRow = {
  exercise_id: string;
  exercise_version_id: string;
  title: string;
  category: ExerciseCategory;
  approved_at: string;
  usage_count: number;
  matched_alias: string | null;
  body_region_labels: string;
};

export type LatestApprovedVersionRow = {
  id: string;
  exercise_id: string;
  version_number: number;
  title: string;
  description: string;
  equipment: string;
  starting_position: string;
  steps: string;
  common_mistakes: string;
  regressions: string;
  progressions: string;
  precautions: string;
  cue_stretching: string | null;
  cue_isometric: string | null;
  cue_concentric: string | null;
  cue_eccentric: string | null;
  approved_at: string;
  created_at: string;
  change_summary: string | null;
  media_set_id: string | null;
  category: ExerciseCategory;
  created_by: string;
};

const LATEST_APPROVED_JOIN = `
  INNER JOIN (
    SELECT exercise_id, MAX(version_number) AS max_version
    FROM exercise_versions
    WHERE status = 'approved'
    GROUP BY exercise_id
  ) latest ON latest.exercise_id = ev.exercise_id
    AND latest.max_version = ev.version_number
  INNER JOIN exercises e ON e.id = ev.exercise_id
  WHERE ev.status = 'approved'
`;

function sortClause(sort: ApprovedExerciseSearchSort): string {
  switch (sort) {
    case "most_used":
      return "usage_count DESC, ev.title COLLATE NOCASE ASC, ev.exercise_id ASC";
    case "newest":
      return "ev.approved_at DESC, ev.title COLLATE NOCASE ASC, ev.exercise_id ASC";
    case "a_to_z":
      return "ev.title COLLATE NOCASE ASC, ev.exercise_id ASC";
  }
}

export class ExerciseLibraryReadRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async searchApproved(input: {
    query?: string;
    category?: ExerciseCategory;
    bodyRegionLabel?: string;
    prescriptionType?: PrescriptionType;
    sort: ApprovedExerciseSearchSort;
    limit: number;
    offset: number;
    exerciseIdsIn?: readonly string[];
  }): Promise<ApprovedExerciseSearchRow[]> {
    if (input.exerciseIdsIn && input.exerciseIdsIn.length === 0) {
      return [];
    }
    const bindings: SqlValue[] = [];
    const whereParts: string[] = [];

    if (input.category) {
      whereParts.push("e.category = ?");
      bindings.push(input.category);
    }

    if (input.prescriptionType) {
      const categories: ExerciseCategory[] = [];
      if (prescriptionTypesForCategory("stretch").includes(input.prescriptionType)) {
        categories.push("stretch");
      }
      if (
        prescriptionTypesForCategory("strengthening").includes(input.prescriptionType)
      ) {
        categories.push("strengthening");
      }
      if (categories.length === 1) {
        whereParts.push("e.category = ?");
        bindings.push(categories[0]);
      }
    }

    const trimmedQuery = input.query?.trim();
    if (trimmedQuery) {
      const like = likeContainsPattern(trimmedQuery);
      whereParts.push(`(
        ev.title LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
        OR EXISTS (
          SELECT 1 FROM exercise_aliases ea
          WHERE ea.exercise_id = e.id AND ea.alias LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
        )
        OR EXISTS (
          SELECT 1 FROM exercise_body_regions ebr
          INNER JOIN body_regions br ON br.id = ebr.body_region_id
          WHERE ebr.exercise_id = e.id AND br.label LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
        )
      )`);
      bindings.push(like, like, like);
    }

    if (input.bodyRegionLabel?.trim()) {
      whereParts.push(`EXISTS (
        SELECT 1 FROM exercise_body_regions ebr
        INNER JOIN body_regions br ON br.id = ebr.body_region_id
        WHERE ebr.exercise_id = e.id AND br.label = ? COLLATE NOCASE
      )`);
      bindings.push(input.bodyRegionLabel.trim());
    }

    if (input.exerciseIdsIn && input.exerciseIdsIn.length > 0) {
      const placeholders = input.exerciseIdsIn.map(() => "?").join(", ");
      whereParts.push(`e.id IN (${placeholders})`);
      bindings.push(...input.exerciseIdsIn);
    }

    const whereSql = whereParts.length > 0 ? `AND ${whereParts.join(" AND ")}` : "";

    const sql = `
      SELECT
        e.id AS exercise_id,
        ev.id AS exercise_version_id,
        ev.title,
        e.category,
        ev.approved_at,
        (
          SELECT COUNT(*)
          FROM practitioner_exercises pe
          WHERE pe.exercise_id = e.id AND pe.last_used_at IS NOT NULL
        ) AS usage_count,
        (
          SELECT ea.alias
          FROM exercise_aliases ea
          WHERE ea.exercise_id = e.id
            AND ? != ''
            AND ea.alias LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
            AND ev.title NOT LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
          ORDER BY length(ea.alias) ASC
          LIMIT 1
        ) AS matched_alias,
        (
          SELECT group_concat(br.label, ', ')
          FROM exercise_body_regions ebr
          INNER JOIN body_regions br ON br.id = ebr.body_region_id
          WHERE ebr.exercise_id = e.id
        ) AS body_region_labels
      FROM exercise_versions ev
      ${LATEST_APPROVED_JOIN}
      ${whereSql}
      ORDER BY ${sortClause(input.sort)}
      LIMIT ? OFFSET ?
    `;

    const aliasNeedle = trimmedQuery ?? "";
    const aliasLike = trimmedQuery ? likeContainsPattern(trimmedQuery) : "";
    const titleLike = aliasLike;

    return this.sql.all<ApprovedExerciseSearchRow>(sql, [
      aliasNeedle,
      aliasLike,
      titleLike,
      ...bindings,
      input.limit,
      input.offset,
    ] as SqlBindings);
  }

  async countApprovedSearch(input: {
    query?: string;
    category?: ExerciseCategory;
    bodyRegionLabel?: string;
    prescriptionType?: PrescriptionType;
    exerciseIdsIn?: readonly string[];
  }): Promise<number> {
    if (input.exerciseIdsIn && input.exerciseIdsIn.length === 0) {
      return 0;
    }
    const bindings: SqlValue[] = [];
    const whereParts: string[] = [];

    if (input.category) {
      whereParts.push("e.category = ?");
      bindings.push(input.category);
    }

    if (input.prescriptionType) {
      const categories: ExerciseCategory[] = [];
      if (prescriptionTypesForCategory("stretch").includes(input.prescriptionType)) {
        categories.push("stretch");
      }
      if (
        prescriptionTypesForCategory("strengthening").includes(input.prescriptionType)
      ) {
        categories.push("strengthening");
      }
      if (categories.length === 1) {
        whereParts.push("e.category = ?");
        bindings.push(categories[0]);
      }
    }

    const trimmedQuery = input.query?.trim();
    if (trimmedQuery) {
      const like = likeContainsPattern(trimmedQuery);
      whereParts.push(`(
        ev.title LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
        OR EXISTS (
          SELECT 1 FROM exercise_aliases ea
          WHERE ea.exercise_id = e.id AND ea.alias LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
        )
        OR EXISTS (
          SELECT 1 FROM exercise_body_regions ebr
          INNER JOIN body_regions br ON br.id = ebr.body_region_id
          WHERE ebr.exercise_id = e.id AND br.label LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
        )
      )`);
      bindings.push(like, like, like);
    }

    if (input.bodyRegionLabel?.trim()) {
      whereParts.push(`EXISTS (
        SELECT 1 FROM exercise_body_regions ebr
        INNER JOIN body_regions br ON br.id = ebr.body_region_id
        WHERE ebr.exercise_id = e.id AND br.label = ? COLLATE NOCASE
      )`);
      bindings.push(input.bodyRegionLabel.trim());
    }

    if (input.exerciseIdsIn && input.exerciseIdsIn.length > 0) {
      const placeholders = input.exerciseIdsIn.map(() => "?").join(", ");
      whereParts.push(`e.id IN (${placeholders})`);
      bindings.push(...input.exerciseIdsIn);
    }

    const whereSql = whereParts.length > 0 ? `AND ${whereParts.join(" AND ")}` : "";

    const row = await this.sql.first<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM exercise_versions ev
      ${LATEST_APPROVED_JOIN}
      ${whereSql}
      `,
      bindings as SqlBindings,
    );
    return row?.count ?? 0;
  }

  async getLatestApprovedByExerciseId(
    exerciseId: string,
  ): Promise<LatestApprovedVersionRow | null> {
    return this.sql.first<LatestApprovedVersionRow>(
      `
      SELECT
        ev.id,
        ev.exercise_id,
        ev.version_number,
        ev.title,
        ev.description,
        ev.equipment,
        ev.starting_position,
        ev.steps,
        ev.common_mistakes,
        ev.regressions,
        ev.progressions,
        ev.precautions,
        ev.cue_stretching,
        ev.cue_isometric,
        ev.cue_concentric,
        ev.cue_eccentric,
        ev.approved_at,
        ev.created_at,
        ev.change_summary,
        ev.media_set_id,
        e.category,
        e.created_by
      FROM exercise_versions ev
      ${LATEST_APPROVED_JOIN}
        AND ev.exercise_id = ?
      LIMIT 1
      `,
      [exerciseId],
    );
  }

  async listBodyRegionLabelsForExercise(exerciseId: string): Promise<string[]> {
    const rows = await this.sql.all<{ label: string }>(
      `SELECT br.label
       FROM exercise_body_regions ebr
       INNER JOIN body_regions br ON br.id = ebr.body_region_id
       WHERE ebr.exercise_id = ?
       ORDER BY br.label ASC`,
      [exerciseId],
    );
    return rows.map((row) => row.label);
  }

  async listAliasesForExercise(exerciseId: string): Promise<string[]> {
    const rows = await this.sql.all<{ alias: string }>(
      `SELECT alias FROM exercise_aliases WHERE exercise_id = ? ORDER BY alias ASC`,
      [exerciseId],
    );
    return rows.map((row) => row.alias);
  }

  async getUsageCount(exerciseId: string): Promise<number> {
    const row = await this.sql.first<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM practitioner_exercises
       WHERE exercise_id = ? AND last_used_at IS NOT NULL`,
      [exerciseId],
    );
    return row?.count ?? 0;
  }
}

export type MyExerciseListRow = {
  exercise_id: string;
  favourite: number;
  saved_at: string;
  last_used_at: string | null;
  text_overrides_json: string;
  param_overrides_json: string;
  request_updated_at: string | null;
};

export class PractitionerMyExercisesRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async listForPractitioner(practitionerId: string): Promise<MyExerciseListRow[]> {
    return this.sql.all<MyExerciseListRow>(
      `
      SELECT
        pe.exercise_id,
        pe.favourite,
        pe.saved_at,
        pe.last_used_at,
        pe.text_overrides_json,
        pe.param_overrides_json,
        (
          SELECT er.updated_at
          FROM exercise_requests er
          WHERE er.exercise_id = pe.exercise_id
            AND er.requested_by = ?
            AND er.status = 'approved'
          ORDER BY er.updated_at DESC
          LIMIT 1
        ) AS request_updated_at
      FROM practitioner_exercises pe
      WHERE pe.practitioner_id = ?
      ORDER BY pe.saved_at DESC
      `,
      [practitionerId, practitionerId],
    );
  }

  async delete(practitionerId: string, exerciseId: string): Promise<boolean> {
    const result = await this.sql.run(
      "DELETE FROM practitioner_exercises WHERE practitioner_id = ? AND exercise_id = ?",
      [practitionerId, exerciseId],
    );
    return result.rowsAffected > 0;
  }

  async setFavourite(
    practitionerId: string,
    exerciseId: string,
    favourite: boolean,
  ): Promise<boolean> {
    const result = await this.sql.run(
      `UPDATE practitioner_exercises
       SET favourite = ?
       WHERE practitioner_id = ? AND exercise_id = ?`,
      [favourite ? 1 : 0, practitionerId, exerciseId],
    );
    return result.rowsAffected > 0;
  }
}
