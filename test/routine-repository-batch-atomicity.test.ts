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
import { SqlBatchGuardError } from "../src/storage/errors/sql-batch-error.js";
import type {
  SqlBatchStatement,
  SqlStoragePort,
} from "../src/storage/ports/sql-storage.js";
import {
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
  RoutineRepositoryError,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import { SQL_BATCH_MIN_ROWS_GUARD_TABLE } from "../src/storage/sql-batch-min-rows-guard.js";
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
        authorId: author,
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

function expectStaleWrite(error: unknown): void {
  expect(error).toBeInstanceOf(RoutineRepositoryError);
  const repoError = error as RoutineRepositoryError;
  expect(repoError.code).toBe("stale_write");
  expect(repoError.cause).toBeInstanceOf(SqlBatchGuardError);
}

function spyBatchCalls(storage: SqlStoragePort): SqlBatchStatement[][] {
  const calls: SqlBatchStatement[][] = [];
  const originalBatch = storage.batch.bind(storage);
  vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
    calls.push(
      statements.map((statement) => ({
        sql: statement.sql,
        bindings: statement.bindings ? [...statement.bindings] : undefined,
        minRowsAffected: statement.minRowsAffected,
      })),
    );
    return originalBatch(statements);
  });
  return calls;
}

async function assertGuardTableEmpty(storage: SqlStoragePort): Promise<void> {
  const rows = await storage.all<{ v: number }>(
    `SELECT v FROM ${SQL_BATCH_MIN_ROWS_GUARD_TABLE} WHERE v = ?`,
    [1],
  );
  expect(rows).toEqual([]);
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
    "SELECT id, status FROM routine_versions WHERE routine_id = ?",
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
    "SELECT id, routine_id FROM practitioner_routines WHERE practitioner_id = ?",
    [practitionerId],
  );
  expect(copies.some((row) => row.routine_id === routineId)).toBe(false);
  const rows = await storage.all<{ id: string }>(
    `SELECT id FROM practitioner_routine_rows WHERE practitioner_routine_id = ?`,
    [copyId],
  );
  expect(rows).toHaveLength(0);
}

describe.each(STORAGE_CASES.filter((c) => c.label !== "InMemorySqlStorage"))(
  "publishDraft stale_write guards ($label)",
  ({ open }) => {
    it("concurrent publishDraft calls leave one winner and stale_write on the loser", async () => {
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
        const versions = new RoutineVersionsRepository(storage);
        const results = await Promise.allSettled([
          versions.publishDraft({
            routineId,
            authorId: author,
            publishedAt: TS,
            name: "Winner",
          }),
          versions.publishDraft({
            routineId,
            authorId: author,
            publishedAt: TS,
            name: "Loser",
          }),
        ]);
        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expectStaleWrite((rejected[0] as PromiseRejectedResult).reason);
        const routine = await new RoutinesRepository(storage).findById(routineId);
        expect(routine?.published_version).toBe(1);
        const draft = await storage.first<{ status: string }>(
          "SELECT status FROM routine_versions WHERE id = ? LIMIT 1",
          [draftVersionId],
        );
        expect(draft?.status).toBe("published");
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });
  },
);

describe.each(STORAGE_CASES.filter((c) => c.label !== "InMemorySqlStorage"))(
  "savePublishedVersion stale_write guards ($label)",
  ({ open }) => {
    it("concurrent savePublishedVersion leaves one v2 and stale_write with no partial v2 row", async () => {
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
        const versions = new RoutineVersionsRepository(storage);
        const v2a = id(`conc-v2-a-${label}`);
        const v2b = id(`conc-v2-b-${label}`);
        const results = await Promise.allSettled([
          versions.savePublishedVersion({
            id: v2a,
            routineId,
            createdBy: author,
            createdAt: TS,
            name: "Concurrent A",
            copyFromVersionId: publishedVersionId,
          }),
          versions.savePublishedVersion({
            id: v2b,
            routineId,
            createdBy: author,
            createdAt: TS,
            name: "Concurrent B",
            copyFromVersionId: publishedVersionId,
          }),
        ]);
        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expectStaleWrite((rejected[0] as PromiseRejectedResult).reason);
        const routine = await new RoutinesRepository(storage).findById(routineId);
        expect(routine?.published_version).toBe(2);
        const winnerRecord = (fulfilled[0] as PromiseFulfilledResult<{ id: string }>)
          .value;
        const winnerId = winnerRecord.id;
        const loserId = winnerId === v2a ? v2b : v2a;
        expect(await versions.findById(loserId)).toBeNull();
        await expectNoSavedPublishedVersion(storage, routineId, 2, loserId);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });
  },
);

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
              authorId: author,
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
      if (storage instanceof InMemorySqlStorage) {
        expect(caught).toBeInstanceOf(SqlBatchGuardError);
      } else {
        expectStaleWrite(caught);
      }
      await expectUnpublishedDraftIntact(storage, routineId, draftVersionId);
    } finally {
      if ("close" in storage && typeof storage.close === "function") {
        storage.close();
      }
    }
  });
});

describe.each(STORAGE_CASES.filter((c) => c.label !== "InMemorySqlStorage"))(
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
        expectStaleWrite(caught);
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
      expectStaleWrite(caught);
      await expectNoFrozenCopy(storage, author, routineId, copyId);
    } finally {
      if ("close" in storage && typeof storage.close === "function") {
        storage.close();
      }
    }
  });
});

describe.each(STORAGE_CASES.filter((c) => c.label !== "InMemorySqlStorage"))(
  "routine repository single batch contract ($label)",
  ({ open }) => {
    it("createDraft issues exactly one batch with the expected statements", async () => {
      const storage = await open();
      try {
        const author = await seedPractitioner(storage);
        const routines = new RoutinesRepository(storage);
        const routineId = id("contract-create-routine");
        const draftVersionId = id("contract-create-draft");
        const calls = spyBatchCalls(storage);
        await routines.createDraft({
          id: routineId,
          draftVersionId,
          createdBy: author,
          createdAt: TS,
          bodyRegionId: BODY_REGION_KNEE,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual(
          routines.buildCreateDraftBatchStatements({
            routineId,
            draftVersionId,
            createdBy: author,
            createdAt: TS,
            conditionId: null,
            bodyRegionId: BODY_REGION_KNEE,
            whoItsFor: null,
            name: null,
          }),
        );
        await assertGuardTableEmpty(storage);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("publishDraft issues exactly one batch with the expected statements", async () => {
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
        const versions = new RoutineVersionsRepository(storage);
        const calls = spyBatchCalls(storage);
        await versions.publishDraft({
          routineId,
          authorId: author,
          publishedAt: TS,
          name: "Contract publish",
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual(
          versions.buildPublishDraftBatchStatements({
            draftVersionId,
            name: "Contract publish",
            routineId,
            publishedAt: TS,
            authorId: author,
          }),
        );
        await assertGuardTableEmpty(storage);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("savePublishedVersion issues exactly one batch with the expected statements", async () => {
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
        const versions = new RoutineVersionsRepository(storage);
        const rowRepo = new RoutineVersionRowsRepository(storage);
        const sourceRows = await rowRepo.listForVersion(publishedVersionId);
        const versionId = id("contract-save-v2");
        const calls = spyBatchCalls(storage);
        await versions.savePublishedVersion({
          id: versionId,
          routineId,
          createdBy: author,
          createdAt: TS,
          name: "Contract v2",
          copyFromVersionId: publishedVersionId,
        });
        expect(calls).toHaveLength(1);
        const batch = calls[0]!;
        const template = versions.buildSavePublishedVersionBatchStatements({
          versionId,
          routineId,
          nextVersion: 2,
          expectedPublishedVersion: 1,
          name: "Contract v2",
          changeSummary: null,
          restoredFrom: null,
          createdBy: author,
          createdAt: TS,
          rowStatements: [],
        });
        expect(batch[0]).toEqual(template[0]);
        expect(batch[1]).toEqual(template[1]);
        expect(batch.length).toBe(2 + sourceRows.length);
        await assertGuardTableEmpty(storage);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("saveFrozenCopy issues exactly one batch with the expected statements", async () => {
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
        const my = new PractitionerRoutinesRepository(storage);
        const copyId = id("contract-copy");
        const rowId = id("contract-copy-row");
        const rowRepo = new PractitionerRoutineRowsRepository(storage);
        const rowStatements = [
          rowRepo.buildInsertRowBatchStatement({
            id: rowId,
            practitionerRoutineId: copyId,
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: VALID_PARAMS,
          }),
        ];
        const calls = spyBatchCalls(storage);
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
        expect(calls).toHaveLength(1);
        expect(calls[0]![0]?.minRowsAffected).toBe(1);
        expect(calls[0]).toEqual(
          my.buildSaveFrozenCopyBatchStatements({
            copyId,
            practitionerId: author,
            routineId,
            sourceRoutineVersionId: publishedVersionId,
            sourceVersionNumber: 1,
            savedAt: TS,
            rowStatements,
          }),
        );
        await assertGuardTableEmpty(storage);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });
  },
);

describe("createDraft batch atomicity (BetterSqliteStorage)", () => {
  it("leaves no routine row when draftVersionId collides", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routines = new RoutinesRepository(storage);
      const sharedVersionId = id("batch-create-shared-rv");
      const routineAId = id("batch-create-a");
      const routineBId = id("batch-create-b");
      await routines.createDraft({
        id: routineAId,
        draftVersionId: sharedVersionId,
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await expect(
        routines.createDraft({
          id: routineBId,
          draftVersionId: sharedVersionId,
          createdBy: author,
          createdAt: TS,
          bodyRegionId: BODY_REGION_KNEE,
        }),
      ).rejects.toThrow(/UNIQUE constraint failed/i);
      expect(await routines.findById(routineBId)).toBeNull();
    } finally {
      storage.close();
    }
  });
});

describe("expect helper regression", () => {
  it("expectNoFrozenCopy fails when a practitioner copy row exists", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const { routineId, publishedVersionId } = await seedPublishedRoutineV1(
        storage,
        author,
        "helper-copy-exists",
      );
      const copyId = id("helper-copy-id");
      await new PractitionerRoutinesRepository(storage).saveFrozenCopy({
        id: copyId,
        practitionerId: author,
        routineId,
        sourceRoutineVersionId: publishedVersionId,
        savedAt: TS,
        rows: [
          {
            id: id("helper-copy-row"),
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: VALID_PARAMS,
          },
        ],
      });
      let assertionFailed = false;
      try {
        await expectNoFrozenCopy(storage, author, routineId, copyId);
      } catch {
        assertionFailed = true;
      }
      expect(assertionFailed).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("expectUnpublishedDraftIntact fails when the draft is published", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const { routineId, draftVersionId } = await seedDraftReadyToPublish(
        storage,
        author,
        "helper-published-check",
      );
      await new RoutineVersionsRepository(storage).publishDraft({
        routineId,
        authorId: author,
        publishedAt: TS,
        name: "Published draft",
      });
      let assertionFailed = false;
      try {
        await expectUnpublishedDraftIntact(storage, routineId, draftVersionId);
      } catch {
        assertionFailed = true;
      }
      expect(assertionFailed).toBe(true);
    } finally {
      storage.close();
    }
  });
});

describe("publishDraft read guards (BetterSqliteStorage)", () => {
  it("rejects a missing routine before any batch write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const calls = spyBatchCalls(storage);
      await expect(
        new RoutineVersionsRepository(storage).publishDraft({
          routineId: id("missing-routine-id"),
          authorId: author,
          publishedAt: TS,
          name: "Nope",
        }),
      ).rejects.toMatchObject({
        name: "RoutineRepositoryError",
        message: "Routine not found",
      });
      expect(calls).toHaveLength(0);
    } finally {
      storage.close();
    }
  });

  it("rejects a foreign author before any batch write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const other = await seedPractitioner(storage, undefined, "other@example.com");
      await seedApprovedExerciseVersion(storage, author);
      const { routineId } = await seedDraftReadyToPublish(
        storage,
        author,
        "foreign-author",
      );
      const calls = spyBatchCalls(storage);
      await expect(
        new RoutineVersionsRepository(storage).publishDraft({
          routineId,
          authorId: other,
          publishedAt: TS,
          name: "Nope",
        }),
      ).rejects.toMatchObject({
        name: "RoutineRepositoryError",
        message: "Only the author can publish this draft",
      });
      expect(calls).toHaveLength(0);
    } finally {
      storage.close();
    }
  });
});
