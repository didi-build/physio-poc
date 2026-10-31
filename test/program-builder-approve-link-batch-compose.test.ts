import { describe, expect, it } from "vitest";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import {
  ProgramBuilderService,
  buildLinkApprovedPlaceholderStatements,
} from "../src/services/programs/program-builder-service.js";
import { SqlBatchGuardError } from "../src/storage/errors/sql-batch-error.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0005_ID,
  MIGRATION_0007_ID,
} from "../src/storage/migrations/apply.js";
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
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";

async function seedOpenExerciseRequest(
  storage: SqlStoragePort,
  practitionerId: string,
  requestId: string,
  requestedName: string,
): Promise<void> {
  const requests = new ExerciseRequestsRepository(storage);
  await requests.insert({
    id: requestId,
    requestedName,
    requestedBy: practitionerId,
    status: "open",
    createdAt: TS,
    updatedAt: TS,
  });
}

async function openMigratedD1SqlStorage(): Promise<D1SqlStorage> {
  const d1 = createFakePhysioD1Database();
  const sql = new D1SqlStorage(d1);
  await applyMigration(sql, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(sql, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(sql, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(sql, MIGRATION_0005_ID, MIGRATION_0005_SQL);
  await applyMigration(sql, MIGRATION_0007_ID, MIGRATION_0007_SQL);
  return sql;
}

type StorageCase = {
  label: string;
  open: () => Promise<SqlStoragePort & { close?: () => void }>;
};

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

describe.each(STORAGE_CASES)("approve and link in one batch ($label)", ({ open }) => {
  it("composes exercise approval with placeholder linking atomically", async () => {
    const storage = await open();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const requestId = id("req-compose");
      await seedOpenExerciseRequest(storage, practitionerId, requestId, "Compose me");
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-compose");
      await service.createProgram(practitionerId, { programId });
      await service.addPlaceholderRow(practitionerId, programId, {
        rowId: id("row-compose"),
        exerciseRequestId: requestId,
        prescriptionType: "stretching",
        params: { hold_s: 20 },
      });
      const { statements: linkStatements } =
        await buildLinkApprovedPlaceholderStatements(
          storage,
          requestId,
          FIXTURE_VERSION_ID,
        );
      expect(linkStatements.length).toBeGreaterThan(0);
      await storage.batch([
        {
          sql: `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ? AND exercise_id IS NULL`,
          bindings: [FIXTURE_EXERCISE_ID, TS, requestId],
          minRowsAffected: 1,
        },
        ...linkStatements,
      ]);
      const view = await service.getProgram(practitionerId, programId);
      expect(view.rows[0]?.kind).toBe("exercise");
      expect(view.rows[0]?.exercise_id).toBe(FIXTURE_EXERCISE_ID);
    } finally {
      if ("close" in storage && typeof storage.close === "function") {
        storage.close();
      }
    }
  });

  it("rolls back approval and link when a later guarded link statement matches zero rows", async () => {
    const storage = await open();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const requestId = id("req-compose-fail");
      await seedOpenExerciseRequest(storage, practitionerId, requestId, "Compose fail");
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-compose-fail");
      const rowId = id("row-compose-fail");
      await service.createProgram(practitionerId, { programId });
      await service.addPlaceholderRow(practitionerId, programId, {
        rowId,
        exerciseRequestId: requestId,
        prescriptionType: "stretching",
      });
      const { statements: linkStatements } =
        await buildLinkApprovedPlaceholderStatements(
          storage,
          requestId,
          FIXTURE_VERSION_ID,
        );
      const otherRequestId = id("req-compose-decoy");
      await seedOpenExerciseRequest(storage, practitionerId, otherRequestId, "Decoy");
      await storage.run(
        `UPDATE program_rows SET exercise_request_id = ? WHERE id = ?`,
        [otherRequestId, rowId],
      );
      await expect(
        storage.batch([
          {
            sql: `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ? AND exercise_id IS NULL`,
            bindings: [FIXTURE_EXERCISE_ID, TS, requestId],
            minRowsAffected: 1,
          },
          ...linkStatements,
        ]),
      ).rejects.toBeInstanceOf(SqlBatchGuardError);
      const row = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM program_rows WHERE id = ? LIMIT 1",
        [rowId],
      );
      expect(row?.exercise_id).toBeNull();
      const request = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ? LIMIT 1",
        [requestId],
      );
      expect(request?.exercise_id).toBeNull();
    } finally {
      if ("close" in storage && typeof storage.close === "function") {
        storage.close();
      }
    }
  });
});
