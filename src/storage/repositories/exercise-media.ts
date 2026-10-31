import type { SqlStoragePort } from "../ports/sql-storage.js";
import type { MediaVisibility } from "../ports/media-storage.js";

export type ExerciseMediaSetRow = {
  id: string;
  start_object_key: string;
  end_object_key: string;
  start_provider_url: string | null;
  visibility: MediaVisibility;
  created_at: string;
};

export type MediaRegenerationScope = "start" | "end" | "both";

export class ExerciseMediaSetsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async insert(input: {
    id: string;
    startObjectKey: string;
    endObjectKey: string;
    startProviderUrl?: string | null;
    visibility: MediaVisibility;
    createdAt: string;
  }): Promise<void> {
    await this.sql.run(
      `INSERT INTO exercise_media_sets (
        id, start_object_key, end_object_key, start_provider_url, visibility, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.startObjectKey,
        input.endObjectKey,
        input.startProviderUrl ?? null,
        input.visibility,
        input.createdAt,
      ],
    );
  }

  async updateStartProviderUrl(
    id: string,
    startProviderUrl: string | null,
  ): Promise<void> {
    await this.sql.run(
      "UPDATE exercise_media_sets SET start_provider_url = ? WHERE id = ?",
      [startProviderUrl, id],
    );
  }

  async findById(id: string): Promise<ExerciseMediaSetRow | null> {
    return this.sql.first<ExerciseMediaSetRow>(
      `SELECT id, start_object_key, end_object_key, start_provider_url, visibility, created_at
       FROM exercise_media_sets WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  async updateVisibility(id: string, visibility: MediaVisibility): Promise<void> {
    await this.sql.run("UPDATE exercise_media_sets SET visibility = ? WHERE id = ?", [
      visibility,
      id,
    ]);
  }
}

export class MediaRegenerationsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async insert(input: {
    id: string;
    practitionerId: string;
    exerciseId: string;
    exerciseVersionId: string | null;
    scope: MediaRegenerationScope;
    hadNote: boolean;
    createdAt: string;
  }): Promise<void> {
    await this.sql.run(
      `INSERT INTO media_regenerations (
        id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.practitionerId,
        input.exerciseId,
        input.exerciseVersionId,
        input.scope,
        input.hadNote ? 1 : 0,
        input.createdAt,
      ],
    );
  }

  async countForPractitionerOnUtcDay(
    practitionerId: string,
    utcDayStartIso: string,
    utcDayEndIso: string,
  ): Promise<number> {
    const row = await this.sql.first<{ count: number }>(
      `SELECT COUNT(*) AS count FROM media_regenerations
       WHERE practitioner_id = ?
         AND created_at >= ?
         AND created_at < ?`,
      [practitionerId, utcDayStartIso, utcDayEndIso],
    );
    return row?.count ?? 0;
  }
}

export type ExerciseVersionMediaRow = {
  id: string;
  exercise_id: string;
  version_number: number;
  status: "draft" | "approved";
  approved_by: string | null;
  approved_at: string | null;
  title: string;
  description: string;
  starting_position: string;
  steps: string;
  media_set_id: string | null;
  change_summary: string | null;
  created_at: string;
};

export class ExerciseVersionMediaRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async findVersion(id: string): Promise<ExerciseVersionMediaRow | null> {
    return this.sql.first<ExerciseVersionMediaRow>(
      `SELECT id, exercise_id, version_number, status, approved_by, approved_at,
              title, description, starting_position, steps, media_set_id, change_summary, created_at
       FROM exercise_versions WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  async findVersionWithExerciseOwner(
    id: string,
  ): Promise<(ExerciseVersionMediaRow & { exercise_created_by: string }) | null> {
    return this.sql.first<ExerciseVersionMediaRow & { exercise_created_by: string }>(
      `SELECT ev.id, ev.exercise_id, ev.version_number, ev.status, ev.approved_by, ev.approved_at,
              ev.title, ev.description, ev.starting_position, ev.steps, ev.media_set_id,
              ev.change_summary, ev.created_at, e.created_by AS exercise_created_by
       FROM exercise_versions ev
       JOIN exercises e ON e.id = ev.exercise_id
       WHERE ev.id = ? LIMIT 1`,
      [id],
    );
  }

  async updateMediaSetId(versionId: string, mediaSetId: string): Promise<void> {
    await this.sql.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
      mediaSetId,
      versionId,
    ]);
  }

  async latestApprovedVersionNumber(exerciseId: string): Promise<number | null> {
    const row = await this.sql.first<{ version_number: number }>(
      `SELECT version_number FROM exercise_versions
       WHERE exercise_id = ? AND status = 'approved'
       ORDER BY version_number DESC LIMIT 1`,
      [exerciseId],
    );
    return row?.version_number ?? null;
  }

  async insertApprovedVersionFromSource(input: {
    id: string;
    source: ExerciseVersionMediaRow;
    versionNumber: number;
    mediaSetId: string;
    approvedBy: string;
    approvedAt: string;
    changeSummary: string;
    createdAt: string;
  }): Promise<void> {
    await this.sql.run(
      `INSERT INTO exercise_versions (
        id, exercise_id, version_number, status, approved_by, approved_at,
        title, description, equipment, starting_position, steps,
        common_mistakes, regressions, progressions, precautions,
        cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
        media_set_id, change_summary, created_at
      )
      SELECT ?, exercise_id, ?, 'approved', ?, ?, title, description, equipment,
             starting_position, steps, common_mistakes, regressions, progressions,
             precautions, cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
             ?, ?, ?
      FROM exercise_versions WHERE id = ?`,
      [
        input.id,
        input.versionNumber,
        input.approvedBy,
        input.approvedAt,
        input.mediaSetId,
        input.changeSummary,
        input.createdAt,
        input.source.id,
      ],
    );
  }
}
