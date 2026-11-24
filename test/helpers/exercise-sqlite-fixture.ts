import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";
import { BetterSqliteStorage } from "../../src/adapters/node/better-sqlite-sql-storage.js";
import {
  generateOpaqueEntityId,
  validateOpaqueEntityId,
} from "../../src/domain/opaque-entity-id.js";
import { ExerciseRequestsRepository } from "../../src/storage/repositories/exercise-data.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0005_ID,
  MIGRATION_0007_ID,
  MIGRATION_0008_ID,
  MIGRATION_0009_ID,
  MIGRATION_0011_ID,
  MIGRATION_0012_ID,
  MIGRATION_0013_ID,
  MIGRATION_0014_ID,
  MIGRATION_0015_ID,
  MIGRATION_0016_ID,
} from "../../src/storage/migrations/apply.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
export const MIGRATION_0001_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0001_exercise_data_model.sql"),
  "utf8",
);
export const MIGRATION_0002_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0002_program_data_model.sql"),
  "utf8",
);
export const MIGRATION_0003_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0003_exercise_media.sql"),
  "utf8",
);
export const MIGRATION_0005_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0005_routine_data_model.sql"),
  "utf8",
);
export const MIGRATION_0007_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0007_sql_batch_min_rows_guard.sql"),
  "utf8",
);
export const MIGRATION_0008_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0008_routine_draft_discards.sql"),
  "utf8",
);
export const MIGRATION_0009_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0009_routine_conditions.sql"),
  "utf8",
);
export const MIGRATION_0011_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0011_exercise_version_pending_media.sql"),
  "utf8",
);
export const MIGRATION_0012_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0012_exercise_suggested_body_regions.sql"),
  "utf8",
);
export const MIGRATION_0013_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0013_exercise_request_generation_lock.sql"),
  "utf8",
);
export const MIGRATION_0014_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0014_draft_generation_attempt_and_failure.sql"),
  "utf8",
);
export const MIGRATION_0015_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0015_draft_generation_abandon_logged.sql"),
  "utf8",
);
export const MIGRATION_0016_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0016_exercise_version_ending_position.sql"),
  "utf8",
);

/** @deprecated use MIGRATION_0001_SQL */
export const MIGRATION_SQL = MIGRATION_0001_SQL;

export const TS = "2026-01-01T00:00:00.000Z";

export const FIXTURE_PRACTITIONER_ID = "11111111-1111-4111-8111-111111111111";
export const FIXTURE_EXERCISE_ID = "22222222-2222-4222-8222-222222222222";
export const FIXTURE_VERSION_ID = "33333333-3333-4333-8333-333333333333";

/** Apply migrations required by VERSION_INSERT_SQL on a DB that already has 0001 exercise schema. */
export async function applyExerciseVersionEndingPositionMigration(
  storage: SqlStoragePort,
): Promise<void> {
  await applyMigration(storage, MIGRATION_0016_ID, MIGRATION_0016_SQL);
}

export async function openMigratedDatabase(): Promise<BetterSqliteStorage> {
  const storage = BetterSqliteStorage.openInMemory();
  await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(storage, MIGRATION_0005_ID, MIGRATION_0005_SQL);
  await applyMigration(storage, MIGRATION_0007_ID, MIGRATION_0007_SQL);
  await applyMigration(storage, MIGRATION_0008_ID, MIGRATION_0008_SQL);
  await applyMigration(storage, MIGRATION_0009_ID, MIGRATION_0009_SQL);
  await applyMigration(storage, MIGRATION_0011_ID, MIGRATION_0011_SQL);
  await applyMigration(storage, MIGRATION_0012_ID, MIGRATION_0012_SQL);
  await applyMigration(storage, MIGRATION_0013_ID, MIGRATION_0013_SQL);
  await applyMigration(storage, MIGRATION_0014_ID, MIGRATION_0014_SQL);
  await applyMigration(storage, MIGRATION_0015_ID, MIGRATION_0015_SQL);
  await applyMigration(storage, MIGRATION_0016_ID, MIGRATION_0016_SQL);
  return storage;
}

export async function seedDraftingExerciseRequest(
  storage: SqlStoragePort,
  input: {
    requestId: string;
    practitionerId: string;
    requestedName: string;
    note?: string | null;
    createdAt?: string;
  },
): Promise<string> {
  const requests = new ExerciseRequestsRepository(storage);
  const createdAt = input.createdAt ?? TS;
  await storage.batch([
    requests.buildInsertBatchStatement({
      id: input.requestId,
      requestedName: input.requestedName,
      note: input.note ?? null,
      requestedBy: input.practitionerId,
      status: "drafting",
      createdAt,
      updatedAt: createdAt,
    }),
  ]);
  return input.requestId;
}

export async function seedPractitioner(
  storage: SqlStoragePort,
  practitionerId?: string,
  email = "coach@example.com",
): Promise<string> {
  const id = practitionerId
    ? validateOpaqueEntityId(practitionerId, "Practitioner id")
    : generateOpaqueEntityId();
  await storage.run(
    "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
    [id, email, TS],
  );
  return id;
}

export async function seedExercise(
  storage: SqlStoragePort,
  practitionerId: string,
  exerciseId = FIXTURE_EXERCISE_ID,
): Promise<string> {
  await storage.run(
    "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
    [exerciseId, "stretch", practitionerId, TS],
  );
  return exerciseId;
}

export function versionInsertBindings(
  overrides: Record<string, unknown> = {},
): (string | number | null)[] {
  const base = {
    id: FIXTURE_VERSION_ID,
    exercise_id: FIXTURE_EXERCISE_ID,
    version_number: 1,
    status: "draft",
    approved_by: null,
    approved_at: null,
    title: "Heel slide",
    description: "",
    equipment: "",
    starting_position: "",
    ending_position: "",
    steps: "",
    common_mistakes: "",
    regressions: "",
    progressions: "",
    precautions: "",
    cue_stretching: null,
    cue_isometric: null,
    cue_concentric: null,
    cue_eccentric: null,
    media_set_id: null,
    change_summary: null,
    created_at: TS,
    ...overrides,
  };
  return [
    base.id,
    base.exercise_id,
    base.version_number,
    base.status,
    base.approved_by,
    base.approved_at,
    base.title,
    base.description,
    base.equipment,
    base.starting_position,
    base.ending_position,
    base.steps,
    base.common_mistakes,
    base.regressions,
    base.progressions,
    base.precautions,
    base.cue_stretching,
    base.cue_isometric,
    base.cue_concentric,
    base.cue_eccentric,
    base.media_set_id,
    base.change_summary,
    base.created_at,
  ];
}

export const VERSION_INSERT_SQL = `INSERT INTO exercise_versions (
  id, exercise_id, version_number, status, approved_by, approved_at,
  title, description, equipment, starting_position, ending_position, steps,
  common_mistakes, regressions, progressions, precautions,
  cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
  media_set_id, change_summary, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export async function seedApprovedExerciseVersion(
  storage: SqlStoragePort,
  practitionerId: string,
): Promise<{ exerciseId: string; versionId: string }> {
  const result = await seedApprovedExerciseVersionWithMedia(storage, practitionerId);
  return { exerciseId: result.exerciseId, versionId: result.versionId };
}

/** Approved exercise without a media set (missing-images failsafe scenarios). */
export async function seedApprovedExerciseVersionWithoutMedia(
  storage: SqlStoragePort,
  practitionerId: string,
): Promise<{ exerciseId: string; versionId: string }> {
  const exerciseId = await seedExercise(storage, practitionerId);
  await storage.run(
    VERSION_INSERT_SQL,
    versionInsertBindings({
      status: "approved",
      approved_by: practitionerId,
      approved_at: TS,
    }),
  );
  return { exerciseId, versionId: FIXTURE_VERSION_ID };
}

export async function insertExerciseMediaSet(
  storage: SqlStoragePort,
  input: {
    id: string;
    startObjectKey: string;
    endObjectKey: string;
    visibility?: "draft" | "public";
  },
): Promise<void> {
  await storage.run(
    `INSERT INTO exercise_media_sets (
      id, start_object_key, end_object_key, start_provider_url, visibility, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.startObjectKey,
      input.endObjectKey,
      null,
      input.visibility ?? "public",
      TS,
    ],
  );
}

export async function attachMediaSetToVersion(
  storage: SqlStoragePort,
  versionId: string,
  mediaSetId: string,
): Promise<void> {
  await storage.run(`UPDATE exercise_versions SET media_set_id = ? WHERE id = ?`, [
    mediaSetId,
    versionId,
  ]);
}

export async function attachPublishableMediaToVersion(
  storage: SqlStoragePort,
  versionId: string,
  mediaSetId?: string,
): Promise<void> {
  const version = await storage.first<{ media_set_id: string | null }>(
    `SELECT media_set_id FROM exercise_versions WHERE id = ? LIMIT 1`,
    [versionId],
  );
  if (version?.media_set_id) {
    const set = await storage.first<{
      start_object_key: string;
      end_object_key: string;
      visibility: string;
    }>(
      `SELECT start_object_key, end_object_key, visibility FROM exercise_media_sets WHERE id = ? LIMIT 1`,
      [version.media_set_id],
    );
    if (
      set &&
      set.visibility === "public" &&
      set.start_object_key.trim().length > 0 &&
      set.end_object_key.trim().length > 0
    ) {
      return;
    }
  }
  const setId = mediaSetId ?? `media-${versionId}`;
  await insertExerciseMediaSet(storage, {
    id: setId,
    startObjectKey: `media-sets/${setId}/start.png`,
    endObjectKey: `media-sets/${setId}/end.png`,
  });
  await attachMediaSetToVersion(storage, versionId, setId);
}

/** Approved exercise with both start and end object keys set (publishable media). */
export async function seedApprovedExerciseVersionWithMedia(
  storage: SqlStoragePort,
  practitionerId: string,
  options: {
    exerciseId?: string;
    versionId?: string;
    mediaSetId?: string;
    title?: string;
  } = {},
): Promise<{ exerciseId: string; versionId: string; mediaSetId: string }> {
  const exerciseId = options.exerciseId ?? FIXTURE_EXERCISE_ID;
  const versionId = options.versionId ?? FIXTURE_VERSION_ID;
  const mediaSetId = options.mediaSetId ?? "44444444-4444-4444-8444-444444444444";
  await seedExercise(storage, practitionerId, exerciseId);
  await storage.run(
    VERSION_INSERT_SQL,
    versionInsertBindings({
      id: versionId,
      exercise_id: exerciseId,
      status: "approved",
      approved_by: practitionerId,
      approved_at: TS,
      title: options.title ?? "Heel slide",
      media_set_id: null,
    }),
  );
  await insertExerciseMediaSet(storage, {
    id: mediaSetId,
    startObjectKey: `media-sets/${mediaSetId}/start.png`,
    endObjectKey: `media-sets/${mediaSetId}/end.png`,
  });
  await attachMediaSetToVersion(storage, versionId, mediaSetId);
  return { exerciseId, versionId, mediaSetId };
}
