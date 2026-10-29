import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";
import { BetterSqliteStorage } from "../../src/adapters/node/better-sqlite-sql-storage.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
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

/** @deprecated use MIGRATION_0001_SQL */
export const MIGRATION_SQL = MIGRATION_0001_SQL;

export const TS = "2026-01-01T00:00:00.000Z";

export async function openMigratedDatabase(): Promise<BetterSqliteStorage> {
  const storage = BetterSqliteStorage.openInMemory();
  await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  return storage;
}

export async function seedPractitioner(
  storage: SqlStoragePort,
  id = "pract-1",
): Promise<string> {
  await storage.run(
    "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
    [id, "coach@example.com", TS],
  );
  return id;
}

export async function seedExercise(
  storage: SqlStoragePort,
  practitionerId: string,
  id = "ex-1",
): Promise<string> {
  await storage.run(
    "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
    [id, "stretch", practitionerId, TS],
  );
  return id;
}

export function versionInsertBindings(
  overrides: Record<string, unknown> = {},
): (string | number | null)[] {
  const base = {
    id: "ver-1",
    exercise_id: "ex-1",
    version_number: 1,
    status: "draft",
    approved_by: null,
    approved_at: null,
    title: "Heel slide",
    description: "",
    equipment: "",
    starting_position: "",
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
  title, description, equipment, starting_position, steps,
  common_mistakes, regressions, progressions, precautions,
  cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
  media_set_id, change_summary, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export async function seedApprovedExerciseVersion(
  storage: SqlStoragePort,
  practitionerId: string,
): Promise<{ exerciseId: string; versionId: string }> {
  const exerciseId = await seedExercise(storage, practitionerId);
  await storage.run(VERSION_INSERT_SQL, versionInsertBindings());
  return { exerciseId, versionId: "ver-1" };
}
