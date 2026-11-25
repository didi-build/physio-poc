import { describe, expect, it } from "vitest";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import {
  ExerciseMediaService,
  ExerciseMediaServiceError,
} from "../src/services/exercise-media/exercise-media-service.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
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
} from "../src/storage/migrations/apply.js";
import {
  FIXTURE_VERSION_ID,
  MIGRATION_0001_SQL,
  MIGRATION_0002_SQL,
  MIGRATION_0003_SQL,
  MIGRATION_0005_SQL,
  MIGRATION_0007_SQL,
  MIGRATION_0008_SQL,
  MIGRATION_0009_SQL,
  MIGRATION_0011_SQL,
  MIGRATION_0012_SQL,
  MIGRATION_0013_SQL,
  MIGRATION_0014_SQL,
  MIGRATION_0015_SQL,
  MIGRATION_0016_SQL,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { createFakePhysioD1Database } from "./helpers/fake-physio-d1-database.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const CAP_DAY_ISO = "2026-10-30T12:00:00.000Z";
const PARALLEL_ATTEMPTS = 8;
const DAILY_LIMIT_MESSAGE = "Daily media regeneration limit reached";
const DAILY_LIMIT_CODE = "daily_limit_reached";

type StorageCase = {
  label: string;
  open: () => Promise<SqlStoragePort & { close?: () => void }>;
};

async function applyExerciseMediaMigrations(storage: SqlStoragePort): Promise<void> {
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
}

async function openMigratedD1SqlStorage(): Promise<D1SqlStorage> {
  const sql = new D1SqlStorage(createFakePhysioD1Database());
  await applyExerciseMediaMigrations(sql);
  return sql;
}

const STORAGE_CASES: StorageCase[] = [
  {
    label: "BetterSqliteStorage",
    open: () => openMigratedDatabase(),
  },
  {
    label: "D1SqlStorage fake",
    open: () => openMigratedD1SqlStorage(),
  },
];

async function seedDraftVersionReadyToRegenerate(storage: SqlStoragePort) {
  const practitionerId = await seedPractitioner(storage);
  const exerciseId = await seedExercise(storage, practitionerId);
  await storage.run(
    `INSERT INTO exercise_versions (
      id, exercise_id, version_number, status, approved_by, approved_at,
      title, description, equipment, starting_position, ending_position, steps,
      common_mistakes, regressions, progressions, precautions,
      cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
      media_set_id, change_summary, created_at
    ) VALUES (${Array(23).fill("?").join(", ")})`,
    versionInsertBindings({
      id: FIXTURE_VERSION_ID,
      exercise_id: exerciseId,
      status: "draft",
      title: "Heel slide",
      starting_position: "Supine",
    }),
  );
  return { practitionerId, exerciseId, versionId: FIXTURE_VERSION_ID };
}

async function seedPractitionerAtCapMinusOne(
  storage: SqlStoragePort,
  exerciseId: string,
  versionId: string,
  practitionerId: string,
): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await storage.run(
      `INSERT INTO media_regenerations (
        id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id(`regen-seed-${index}`),
        practitionerId,
        exerciseId,
        versionId,
        "start",
        0,
        CAP_DAY_ISO,
      ],
    );
  }
}

function createService(storage: SqlStoragePort): ExerciseMediaService {
  let tick = 0;
  return new ExerciseMediaService(
    storage,
    new FakeImageGeneration(),
    new PrefixMediaStorage(new InMemoryObjectStorage()),
    () => new Date(`2026-10-30T12:00:${String(tick++).padStart(2, "0")}.000Z`),
    () => testOpaqueEntityId(`parallel-media-${tick}`),
  );
}

describe.each(STORAGE_CASES)(
  "exercise media daily cap parallel boundary ($label)",
  ({ open }) => {
    it("allows exactly one parallel regenerate when one slot remains", async () => {
      const storage = await open();
      try {
        const { practitionerId, exerciseId, versionId } =
          await seedDraftVersionReadyToRegenerate(storage);
        const service = createService(storage);
        await service.generateInitialMediaForVersion({
          practitionerId,
          exerciseVersionId: versionId,
          countTowardDailyQuota: false,
        });
        await seedPractitionerAtCapMinusOne(
          storage,
          exerciseId,
          versionId,
          practitionerId,
        );

        const results = await Promise.allSettled(
          Array.from({ length: PARALLEL_ATTEMPTS }, () =>
            service.regenerateMedia({
              practitionerId,
              exerciseVersionId: versionId,
              scope: "start",
            }),
          ),
        );

        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(PARALLEL_ATTEMPTS - 1);

        for (const result of rejected) {
          expect(result).toMatchObject({
            status: "rejected",
            reason: expect.any(ExerciseMediaServiceError),
          });
          const error = (result as PromiseRejectedResult)
            .reason as ExerciseMediaServiceError;
          expect(error.code).toBe(DAILY_LIMIT_CODE);
          expect(error.message).toBe(DAILY_LIMIT_MESSAGE);
        }

        const countRow = await storage.first<{ count: number }>(
          `SELECT COUNT(*) AS count FROM media_regenerations
           WHERE practitioner_id = ?`,
          [practitionerId],
        );
        expect(countRow?.count).toBe(5);
      } finally {
        storage.close?.();
      }
    });
  },
);
