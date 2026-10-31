import { describe, expect, it, vi } from "vitest";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";
import {
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import {
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0005_ID,
  applyMigration,
} from "../src/storage/migrations/apply.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  MIGRATION_0001_SQL,
  MIGRATION_0002_SQL,
  MIGRATION_0003_SQL,
  MIGRATION_0005_SQL,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { createFakePhysioD1Database } from "./helpers/fake-physio-d1-database.js";
import { id } from "./helpers/opaque-test-ids.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";

const BODY_REGION_KNEE = "br-knee";

async function publishTwoRowRoutine(
  storage: SqlStoragePort,
  author: string,
): Promise<{ routineId: string; rowIds: [string, string] }> {
  const routines = new RoutinesRepository(storage);
  const rows = new RoutineVersionRowsRepository(storage);
  const versions = new RoutineVersionsRepository(storage);
  const routineId = id("batch-routine");
  await routines.createDraft({
    id: routineId,
    draftVersionId: id("batch-rv-draft"),
    createdBy: author,
    createdAt: TS,
    bodyRegionId: BODY_REGION_KNEE,
  });
  await rows.replaceDraftRow({
    id: id("batch-rvr-1"),
    routineId,
    authorId: author,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
    draftUpdatedAt: TS,
  });
  await rows.replaceDraftRow({
    id: id("batch-rvr-2"),
    routineId,
    authorId: author,
    position: 1,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
    draftUpdatedAt: TS,
  });
  await versions.publishDraft({
    routineId,
    authorId: author,
    publishedAt: TS,
    name: "Batch routine",
  });
  return { routineId, rowIds: [id("batch-row-a"), id("batch-row-b")] };
}

async function openMigratedD1SqlStorage(): Promise<D1SqlStorage> {
  const d1 = createFakePhysioD1Database();
  const sql = new D1SqlStorage(d1);
  await applyMigration(sql, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(sql, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(sql, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(sql, MIGRATION_0005_ID, MIGRATION_0005_SQL);
  return sql;
}

async function expectNoProgramAfterPoisonedBatch(
  storage: SqlStoragePort,
  programId: string,
): Promise<void> {
  const programs = new ProgramsRepository(storage);
  expect(await programs.findById(programId)).toBeNull();
  const rows = await storage.all<{ id: string }>(
    "SELECT id FROM program_rows WHERE program_id = ?",
    [programId],
  );
  expect(rows).toHaveLength(0);
}

describe("createProgramFromRoutine batch atomicity", () => {
  it("BetterSqliteStorage leaves no program when batch fails mid write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const { routineId, rowIds } = await publishTwoRowRoutine(storage, practitionerId);
      const programId = id("prog-batch-sqlite");
      const service = new ProgramBuilderService(storage);
      const originalBatch = storage.batch.bind(storage);
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        const poisoned = [
          ...statements.slice(0, 3),
          {
            sql: "INSERT INTO program_rows (id, program_id, position) VALUES (?, ?, ?)",
            bindings: [id("poison-row"), id("missing-program-id"), 99],
          },
          ...statements.slice(3),
        ];
        return originalBatch(poisoned);
      });
      await expect(
        service.createProgramFromRoutine(practitionerId, {
          programId,
          routineId,
          source: "community",
          rowIds,
        }),
      ).rejects.toThrow();
      await expectNoProgramAfterPoisonedBatch(storage, programId);
    } finally {
      storage.close();
    }
  });

  it("D1SqlStorage fake leaves no program when batch fails mid write", async () => {
    const storage = await openMigratedD1SqlStorage();
    const practitionerId = await seedPractitioner(storage);
    await seedApprovedExerciseVersion(storage, practitionerId);
    const { routineId, rowIds } = await publishTwoRowRoutine(storage, practitionerId);
    const programId = id("prog-batch-d1");
    const service = new ProgramBuilderService(storage);
    const originalBatch = storage.batch.bind(storage);
    vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
      const poisoned = [
        ...statements.slice(0, 3),
        {
          sql: "INSERT INTO program_rows (id, program_id, position) VALUES (?, ?, ?)",
          bindings: [id("poison-row-d1"), id("missing-program-id"), 99],
        },
        ...statements.slice(3),
      ];
      return originalBatch(poisoned);
    });
    await expect(
      service.createProgramFromRoutine(practitionerId, {
        programId,
        routineId,
        source: "community",
        rowIds,
      }),
    ).rejects.toThrow();
    await expectNoProgramAfterPoisonedBatch(storage, programId);
  });
});
