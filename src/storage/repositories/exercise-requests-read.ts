import type { SqlStoragePort } from "../ports/sql-storage.js";
import { likeContainsPattern } from "../../domain/sql-like.js";

const LIKE_ESCAPE_SQL = " ESCAPE '\\'";

export type InProgressRequestRow = {
  id: string;
  requested_name: string;
  note: string | null;
  requested_by: string;
  status: string;
  exercise_id: string | null;
  draft_title: string | null;
  created_at: string;
  updated_at: string;
};

export type SimilarInProgressRow = {
  id: string;
  requested_name: string;
  note: string | null;
  requested_by: string;
  status: string;
  exercise_id: string | null;
  created_at: string;
  draft_title: string | null;
};

export class ExerciseRequestsReadRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async listInProgress(): Promise<InProgressRequestRow[]> {
    return this.sql.all<InProgressRequestRow>(
      `
      SELECT
        er.id,
        er.requested_name,
        er.note,
        er.requested_by,
        er.status,
        er.exercise_id,
        (
          SELECT ev.title
          FROM exercise_versions ev
          WHERE ev.exercise_id = er.exercise_id AND ev.status = 'draft'
          ORDER BY ev.version_number DESC
          LIMIT 1
        ) AS draft_title,
        er.created_at,
        er.updated_at
      FROM exercise_requests er
      WHERE er.status IN ('open', 'drafting')
      ORDER BY er.updated_at DESC, er.id ASC
      `,
    );
  }

  async listInProgressDraftsForSimilarQuery(
    query: string,
  ): Promise<SimilarInProgressRow[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const like = likeContainsPattern(trimmed);
    return this.sql.all<SimilarInProgressRow>(
      `
      SELECT
        er.id,
        er.requested_name,
        er.note,
        er.requested_by,
        er.status,
        er.exercise_id,
        er.created_at,
        (
          SELECT ev.title
          FROM exercise_versions ev
          WHERE ev.exercise_id = er.exercise_id AND ev.status = 'draft'
          ORDER BY ev.version_number DESC
          LIMIT 1
        ) AS draft_title
      FROM exercise_requests er
      WHERE er.status IN ('open', 'drafting')
        AND (
          er.requested_name LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
          OR EXISTS (
            SELECT 1 FROM exercise_versions ev
            WHERE ev.exercise_id = er.exercise_id
              AND ev.status = 'draft'
              AND ev.title LIKE ?${LIKE_ESCAPE_SQL} COLLATE NOCASE
          )
        )
      ORDER BY er.updated_at DESC
      LIMIT 25
      `,
      [like, like],
    );
  }

  async findConflictCandidate(input: {
    requestedBy: string;
    requestedName: string;
    formOpenedAt: string;
  }): Promise<SimilarInProgressRow | null> {
    const rows = await this.sql.all<SimilarInProgressRow>(
      `
      SELECT
        er.id,
        er.requested_name,
        er.note,
        er.requested_by,
        er.status,
        er.exercise_id,
        er.created_at,
        (
          SELECT ev.title
          FROM exercise_versions ev
          WHERE ev.exercise_id = er.exercise_id AND ev.status = 'draft'
          ORDER BY ev.version_number DESC
          LIMIT 1
        ) AS draft_title
      FROM exercise_requests er
      WHERE er.requested_by <> ?
        AND er.status IN ('open', 'drafting')
        AND er.created_at > ?
      ORDER BY er.created_at ASC
      `,
      [input.requestedBy, input.formOpenedAt],
    );
    for (const row of rows) {
      if (
        namesSimilarForConflict(input.requestedName, row.requested_name) ||
        (row.draft_title &&
          namesSimilarForConflict(input.requestedName, row.draft_title))
      ) {
        return row;
      }
    }
    return null;
  }
}

function namesSimilarForConflict(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left === right) {
    return true;
  }
  if (left.includes(right) || right.includes(left)) {
    return true;
  }
  return false;
}
