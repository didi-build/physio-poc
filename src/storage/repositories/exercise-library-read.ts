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

/**
 * usage_count: number of program_rows whose exercise_id equals the exercise, in programs
 * that are not soft-deleted (programs.deleted_at IS NULL). Rows count regardless of which
 * exercise_version_id they reference. Each row counts once (duplicate rows in the same
 * program count separately). Counts rows across all practitioners' programs.
 * Deleting a program is not a use; Recently deleted is a trash bin, so those rows are excluded
 * until the program is restored. Placeholder rows (exercise_id IS NULL) are excluded.
 * Keep USAGE_COUNT_LIST_SQL and USAGE_COUNT_DETAILS_SQL in sync (All exercises list vs details).
 */
const USAGE_COUNT_LIST_SQL = `SELECT COUNT(*)
  FROM program_rows pr_usage
  INNER JOIN programs p_usage ON p_usage.id = pr_usage.program_id
  WHERE pr_usage.exercise_id = e.id
    AND p_usage.deleted_at IS NULL`;

const USAGE_COUNT_DETAILS_SQL = `SELECT COUNT(*) AS count
  FROM program_rows pr_usage
  INNER JOIN programs p_usage ON p_usage.id = pr_usage.program_id
  WHERE pr_usage.exercise_id = ?
    AND p_usage.deleted_at IS NULL`;

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
      return "usage_count DESC, ev.title COLLATE NOCASE ASC";
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
    savedByPractitionerId?: string;
  }): Promise<ApprovedExerciseSearchRow[]> {
    const bindings: SqlValue[] = [];
    const whereParts: string[] = [];

    if (input.savedByPractitionerId) {
      whereParts.push(`EXISTS (
        SELECT 1 FROM practitioner_exercises pe_scope
        WHERE pe_scope.practitioner_id = ? AND pe_scope.exercise_id = e.id
      )`);
      bindings.push(input.savedByPractitionerId);
    }

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

    const whereSql = whereParts.length > 0 ? `AND ${whereParts.join(" AND ")}` : "";

    const sql = `
      SELECT
        e.id AS exercise_id,
        ev.id AS exercise_version_id,
        ev.title,
        e.category,
        ev.approved_at,
        (${USAGE_COUNT_LIST_SQL}) AS usage_count,
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
    savedByPractitionerId?: string;
  }): Promise<number> {
    const bindings: SqlValue[] = [];
    const whereParts: string[] = [];

    if (input.savedByPractitionerId) {
      whereParts.push(`EXISTS (
        SELECT 1 FROM practitioner_exercises pe_scope
        WHERE pe_scope.practitioner_id = ? AND pe_scope.exercise_id = e.id
      )`);
      bindings.push(input.savedByPractitionerId);
    }

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

  async getApprovedVersionById(
    versionId: string,
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
      INNER JOIN exercises e ON e.id = ev.exercise_id
      WHERE ev.id = ? AND ev.status = 'approved'
      LIMIT 1
      `,
      [versionId],
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
    const row = await this.sql.first<{ count: number }>(USAGE_COUNT_DETAILS_SQL, [
      exerciseId,
    ]);
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
