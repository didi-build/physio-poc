import { describe, expect, it, vi } from "vitest";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0005_ID,
  MIGRATION_0007_ID,
  splitSqlStatements,
} from "../src/storage/migrations/apply.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import {
  PractitionerRoutinesRepository,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  MIGRATION_0001_SQL,
  MIGRATION_0002_SQL,
  MIGRATION_0003_SQL,
  MIGRATION_0005_SQL,
  MIGRATION_0007_SQL,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { createFakePhysioD1Database } from "./helpers/fake-physio-d1-database.js";
import { id } from "./helpers/opaque-test-ids.js";

const BODY_REGION_KNEE = "br-knee";
const VALID_PARAMS = {
  hold_s: 30,
  per_day: { min: 1, max: 2 },
  days_per_week: 7,
} as const;

type StorageCase = {
  label: string;
  open: () => Promise<SqlStoragePort & { close?: () => void }>;
};

async function applyRoutineMigrations(storage: SqlStoragePort): Promise<void> {
  await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(storage, MIGRATION_0005_ID, MIGRATION_0005_SQL);
  await applyMigration(storage, MIGRATION_0007_ID, MIGRATION_0007_SQL);
}

async function ensureBatchGuardTable(storage: SqlStoragePort): Promise<void> {
  for (const statement of splitSqlStatements(MIGRATION_0007_SQL)) {
    await storage.run(statement);
  }
}

async function openMigratedInMemoryStorage(): Promise<InMemorySqlStorage> {
  const storage = new InMemorySqlStorage();
  await ensureBatchGuardTable(storage);
  return storage;
}

async function openMigratedD1SqlStorage(): Promise<D1SqlStorage> {
  const sql = new D1SqlStorage(createFakePhysioD1Database());
  await applyRoutineMigrations(sql);
  return sql;
}

const STORAGE_CASES: StorageCase[] = [
  {
    label: "InMemorySqlStorage",
    open: () => openMigratedInMemoryStorage(),
  },
  {
    label: "BetterSqliteStorage",
    open: () => openMigratedDatabase(),
  },
  {
    label: "D1SqlStorage fake",
    open: () => openMigratedD1SqlStorage(),
  },
];

async function seedDraftReadyToPublish(
  storage: SqlStoragePort,
  author: string,
  label: string,
): Promise<{ routineId: string; draftVersionId: string }> {
  const routineId = id(`pub-routine-${label}`);
  const draftVersionId = id(`pub-draft-${label}`);
  if (storage instanceof InMemorySqlStorage) {
    await storage.run(
      `INSERT INTO routines (
        id, created_by, created_at, condition_id, body_region_id, who_its_for,
        published_version, draft_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [routineId, author, TS, null, BODY_REGION_KNEE, null, null, TS],
    );
    await storage.run(
      `INSERT INTO routine_versions (
        id, routine_id, version_number, status, name, change_summary,
        restored_from_version_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [draftVersionId, routineId, 0, "draft", null, null, null, author, TS],
    );
  } else {
    const routines = new RoutinesRepository(storage);
    await routines.createDraft({
      id: routineId,
      draftVersionId,
      createdBy: author,
      createdAt: TS,
      bodyRegionId: BODY_REGION_KNEE,
    });
  }
  const rows = new RoutineVersionRowsRepository(storage);
  const rowInput = {
    id: id(`pub-row-${label}`),
    routineId,
    authorId: author,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching" as const,
    params: VALID_PARAMS,
    draftUpdatedAt: TS,
  };
  if (storage instanceof InMemorySqlStorage) {
    await rows.insertRow({
      id: rowInput.id,
      routineVersionId: draftVersionId,
      position: rowInput.position,
      exerciseId: rowInput.exerciseId,
      exerciseVersionId: rowInput.exerciseVersionId,
      prescriptionType: rowInput.prescriptionType,
      params: rowInput.params,
    });
  } else {
    await rows.replaceDraftRow(rowInput);
  }
  return { routineId, draftVersionId };
}

async function seedPublishedRoutineV1(
  storage: SqlStoragePort,
  author: string,
  label: string,
): Promise<{ routineId: string; publishedVersionId: string }> {
  const { routineId, draftVersionId } = await seedDraftReadyToPublish(
    storage,
    author,
    label,
  );
  const versions = new RoutineVersionsRepository(storage);
  const publishName = `Published ${label}`;
  if (storage instanceof InMemorySqlStorage) {
    await storage.batch(
      versions.buildPublishDraftBatchStatements({
        draftVersionId,
        name: publishName,
        routineId,
        publishedAt: TS,
      }),
    );
    return { routineId, publishedVersionId: draftVersionId };
  }
  const published = await versions.publishDraft({
    routineId,
    authorId: author,
    publishedAt: TS,
    name: publishName,
  });
  return { routineId, publishedVersionId: published.id };
}

function batchFailureGuardStatement(routineId: string): {
  sql: string;
  bindings: (string | number)[];
  minRowsAffected: number;
} {
  return {
    sql: "UPDATE routines SET draft_updated_at = ? WHERE id = ? AND published_version = ?",
    bindings: [TS, routineId, -1],
    minRowsAffected: 1,
  };
}

function poisonBatchAfterIndex(
  storage: SqlStoragePort,
  afterIndex: number,
  poison: { sql: string; bindings?: readonly (string | number | boolean | null)[] },
): void {
  const originalBatch = storage.batch.bind(storage);
  vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
    const poisoned = [
      ...statements.slice(0, afterIndex + 1),
      poison,
      ...statements.slice(afterIndex + 1),
    ];
    return originalBatch(poisoned);
  });
}

async function expectUnpublishedDraftIntact(
  storage: SqlStoragePort,
  routineId: string,
  draftVersionId: string,
): Promise<void> {
  const routine = await new RoutinesRepository(storage).findById(routineId);
  expect(routine?.published_version).toBeNull();
  const draft = await storage.first<{ status: string; version_number: number }>(
    `SELECT status, version_number FROM routine_versions WHERE id = ? LIMIT 1`,
    [draftVersionId],
  );
  expect(draft?.status).toBe("draft");
  expect(draft?.version_number).toBe(0);
  const versionRows = await storage.all<{ id: string; status: string }>(
    "SELECT id FROM routine_versions WHERE routine_id = ?",
    [routineId],
  );
  const published = versionRows.filter((row) => row.status === "published");
  expect(published).toHaveLength(0);
}

async function expectNoSavedPublishedVersion(
  storage: SqlStoragePort,
  routineId: string,
  previousPublishedVersion: number,
  attemptedVersionId: string,
): Promise<void> {
  const routine = await new RoutinesRepository(storage).findById(routineId);
  expect(routine?.published_version).toBe(previousPublishedVersion);
  const version = await storage.first<{ id: string }>(
    `SELECT id FROM routine_versions WHERE id = ? LIMIT 1`,
    [attemptedVersionId],
  );
  expect(version).toBeNull();
  const rows = await storage.all<{ id: string }>(
    `SELECT id FROM routine_version_rows WHERE routine_version_id = ?`,
    [attemptedVersionId],
  );
  expect(rows).toHaveLength(0);
}

async function expectNoFrozenCopy(
  storage: SqlStoragePort,
  practitionerId: string,
  routineId: string,
  copyId: string,
): Promise<void> {
  const copies = await storage.all<{ id: string; routine_id: string }>(
    "SELECT id FROM practitioner_routines WHERE practitioner_id = ?",
    [practitionerId],
  );
  expect(copies.some((row) => row.routine_id === routineId)).toBe(false);
  const rows = await storage.all<{ id: string }>(
    `SELECT id FROM practitioner_routine_rows WHERE practitioner_routine_id = ?`,
    [copyId],
  );
  expect(rows).toHaveLength(0);
}

describe.each(STORAGE_CASES)("publishDraft batch atomicity ($label)", ({ open }) => {
  it("leaves draft unpublished when batch fails mid write", async () => {
    const storage = await open();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const label = storage.constructor.name;
      const { routineId, draftVersionId } = await seedDraftReadyToPublish(
        storage,
        author,
        label,
      );
      poisonBatchAfterIndex(storage, 0, batchFailureGuardStatement(routineId));
      const versions = new RoutineVersionsRepository(storage);
      let caught: unknown;
      try {
        if (storage instanceof InMemorySqlStorage) {
          await storage.batch(
            versions.buildPublishDraftBatchStatements({
              draftVersionId,
              name: "Should not stick",
              routineId,
              publishedAt: TS,
            }),
          );
        } else {
          await versions.publishDraft({
            routineId,
            authorId: author,
            publishedAt: TS,
            name: "Should not stick",
          });
        }
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeDefined();
      await expectUnpublishedDraftIntact(storage, routineId, draftVersionId);
    } finally {
      if ("close" in storage && typeof storage.close === "function") {
        storage.close();
      }
    }
  });
});

describe.each(STORAGE_CASES)(
  "savePublishedVersion batch atomicity ($label)",
  ({ open }) => {
    it("leaves prior published version when batch fails mid write", async () => {
      const storage = await open();
      try {
        const author = await seedPractitioner(storage);
        await seedApprovedExerciseVersion(storage, author);
        const label = storage.constructor.name;
        const { routineId, publishedVersionId } = await seedPublishedRoutineV1(
          storage,
          author,
          label,
        );
        const attemptedVersionId = id(`save-pub-v2-${label}`);
        poisonBatchAfterIndex(storage, 0, batchFailureGuardStatement(routineId));
        const versions = new RoutineVersionsRepository(storage);
        let caught: unknown;
        try {
          await versions.savePublishedVersion({
            id: attemptedVersionId,
            routineId,
            createdBy: author,
            createdAt: TS,
            name: "Version two",
            copyFromVersionId: publishedVersionId,
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeDefined();
        await expectNoSavedPublishedVersion(storage, routineId, 1, attemptedVersionId);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });
  },
);

describe.each(STORAGE_CASES)("saveFrozenCopy batch atomicity ($label)", ({ open }) => {
  it("leaves no practitioner copy when batch fails mid write", async () => {
    const storage = await open();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const label = storage.constructor.name;
      const { routineId, publishedVersionId } = await seedPublishedRoutineV1(
        storage,
        author,
        label,
      );
      const copyId = id(`frozen-copy-${label}`);
      const rowId = id(`frozen-row-${label}`);
      poisonBatchAfterIndex(storage, 0, batchFailureGuardStatement(routineId));
      const my = new PractitionerRoutinesRepository(storage);
      let caught: unknown;
      try {
        await my.saveFrozenCopy({
          id: copyId,
          practitionerId: author,
          routineId,
          sourceRoutineVersionId: publishedVersionId,
          savedAt: TS,
          rows: [
            {
              id: rowId,
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            },
          ],
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeDefined();
      await expectNoFrozenCopy(storage, author, routineId, copyId);
    } finally {
      if ("close" in storage && typeof storage.close === "function") {
        storage.close();
      }
    }
  });
});
