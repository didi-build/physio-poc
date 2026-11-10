import type { SqlBindings, SqlStoragePort, SqlValue } from "../ports/sql-storage.js";
import { likeContainsPattern } from "../../domain/sql-like.js";

const LIKE_ESCAPE_SQL = " ESCAPE '\\'";

export type RoutineSearchSort = "most_used" | "newest" | "a_to_z";

export type PublishedRoutineSearchRow = {
  routine_id: string;
  routine_version_id: string;
  name: string;
  version_number: number;
  published_at: string;
  created_by: string;
  body_region_label: string;
  condition_id: string | null;
  condition_label: string | null;
  usage_count: number;
  exercise_count: number;
};

function sortClause(sort: RoutineSearchSort): string {
  switch (sort) {
    case "most_used":
      return "usage_count DESC, rv.name COLLATE NOCASE ASC, r.id ASC";
    case "newest":
      return "rv.created_at DESC, rv.name COLLATE NOCASE ASC, r.id ASC";
    case "a_to_z":
      return "rv.name COLLATE NOCASE ASC, r.id ASC";
  }
}

const USAGE_COUNT_SQL = `(
  SELECT COUNT(*)
  FROM programs p_usage
  WHERE p_usage.source_routine_id = r.id AND p_usage.deleted_at IS NULL
)`;

const EXERCISE_COUNT_SQL = `(
  SELECT COUNT(*)
  FROM routine_version_rows rvr_count
  WHERE rvr_count.routine_version_id = rv.id
)`;

const PUBLISHED_ROUTINE_JOIN = `
  FROM routines r
  INNER JOIN routine_versions rv ON rv.routine_id = r.id
    AND rv.status = 'published'
    AND rv.version_number = r.published_version
  INNER JOIN body_regions br ON br.id = r.body_region_id
  LEFT JOIN conditions c ON c.id = r.condition_id
  WHERE r.published_version IS NOT NULL
`;

export class RoutineLibraryReadRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  buildPublishedSearchWhere(
    input: {
      query?: string;
      bodyRegionLabel?: string;
      conditionId?: string;
      includeConditionInTextSearch: boolean;
      createdBy?: string;
    },
    bindings: SqlValue[],
  ): string {
    const whereParts: string[] = [];

    if (input.createdBy) {
      whereParts.push("r.created_by = ?");
      bindings.push(input.createdBy);
    }

    const trimmedQuery = input.query?.trim();
    if (trimmedQuery) {
      const like = likeContainsPattern(trimmedQuery);
      const queryParts = [
        `rv.name LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE`,
        `br.label LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE`,
        `EXISTS (
          SELECT 1
          FROM routine_version_rows rvr_q
          INNER JOIN exercise_versions ev ON ev.id = rvr_q.exercise_version_id
          WHERE rvr_q.routine_version_id = rv.id
            AND ev.title LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
        )`,
      ];
      bindings.push(like, like, like);
      if (input.includeConditionInTextSearch) {
        queryParts.push(`c.label LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE`);
        bindings.push(like);
      }
      whereParts.push(`(${queryParts.join(" OR ")})`);
    }

    if (input.bodyRegionLabel?.trim()) {
      whereParts.push("br.label = ? COLLATE NOCASE");
      bindings.push(input.bodyRegionLabel.trim());
    }

    if (input.conditionId) {
      whereParts.push("r.condition_id = ?");
      bindings.push(input.conditionId);
    }

    return whereParts.length > 0 ? ` AND ${whereParts.join(" AND ")}` : "";
  }

  async searchPublished(input: {
    query?: string;
    bodyRegionLabel?: string;
    conditionId?: string;
    includeConditionInTextSearch: boolean;
    createdBy?: string;
    sort: RoutineSearchSort;
    limit: number;
    offset: number;
  }): Promise<PublishedRoutineSearchRow[]> {
    const bindings: SqlValue[] = [];
    const whereSql = this.buildPublishedSearchWhere(input, bindings);

    const sql = `
      SELECT
        r.id AS routine_id,
        rv.id AS routine_version_id,
        rv.name AS name,
        rv.version_number AS version_number,
        rv.created_at AS published_at,
        r.created_by AS created_by,
        br.label AS body_region_label,
        r.condition_id AS condition_id,
        c.label AS condition_label,
        ${USAGE_COUNT_SQL} AS usage_count,
        ${EXERCISE_COUNT_SQL} AS exercise_count
      ${PUBLISHED_ROUTINE_JOIN}
      ${whereSql}
      ORDER BY ${sortClause(input.sort)}
      LIMIT ? OFFSET ?
    `;

    return this.sql.all<PublishedRoutineSearchRow>(sql, [
      ...bindings,
      input.limit,
      input.offset,
    ] as SqlBindings);
  }

  async countPublishedSearch(input: {
    query?: string;
    bodyRegionLabel?: string;
    conditionId?: string;
    includeConditionInTextSearch: boolean;
    createdBy?: string;
  }): Promise<number> {
    const bindings: SqlValue[] = [];
    const whereSql = this.buildPublishedSearchWhere(input, bindings);

    const row = await this.sql.first<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      ${PUBLISHED_ROUTINE_JOIN}
      ${whereSql}
      `,
      bindings as SqlBindings,
    );
    return row?.count ?? 0;
  }

  async getPublishedHead(routineId: string): Promise<PublishedRoutineSearchRow | null> {
    return this.sql.first<PublishedRoutineSearchRow>(
      `
      SELECT
        r.id AS routine_id,
        rv.id AS routine_version_id,
        rv.name AS name,
        rv.version_number AS version_number,
        rv.created_at AS published_at,
        r.created_by AS created_by,
        br.label AS body_region_label,
        r.condition_id AS condition_id,
        c.label AS condition_label,
        ${USAGE_COUNT_SQL} AS usage_count,
        ${EXERCISE_COUNT_SQL} AS exercise_count
      ${PUBLISHED_ROUTINE_JOIN}
        AND r.id = ?
      LIMIT 1
      `,
      [routineId],
    );
  }
}
