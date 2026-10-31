import { describe, expect, it } from "vitest";
import {
  ProgramRepositoryError,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import {
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const BODY_REGION_KNEE = "br-knee";
const VALID_PARAMS = {
  hold_s: 30,
  per_day: { min: 1, max: 2 },
  days_per_week: 7,
} as const;

describe("QA round 2: createDraft batch (DIDI-1098)", () => {
  it("leaves no routine row when draftVersionId is reused on a second createDraft", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const sharedVersionId = id("partial-shared-rv");
      const routineAId = id("partial-routine-a");
      const routineBId = id("partial-routine-b");
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
      expect(await routines.findById(routineAId)).not.toBeNull();
    } finally {
      storage.close();
    }
  });
});

describe("QA round 2: setRoutineOrigin on missing or soft-deleted programs", () => {
  async function seedPublishedRoutine(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
    author: string,
  ) {
    const routines = new RoutinesRepository(storage);
    const rows = new RoutineVersionRowsRepository(storage);
    const versions = new RoutineVersionsRepository(storage);
    const routineId = id("origin-target-routine");
    await routines.createDraft({
      id: routineId,
      draftVersionId: id("origin-target-rv-draft"),
      createdBy: author,
      createdAt: TS,
      bodyRegionId: BODY_REGION_KNEE,
    });
    await rows.replaceDraftRow({
      id: id("origin-target-row"),
      routineId,
      authorId: author,
      position: 0,
      exerciseId: FIXTURE_EXERCISE_ID,
      exerciseVersionId: FIXTURE_VERSION_ID,
      prescriptionType: "stretching",
      params: VALID_PARAMS,
      draftUpdatedAt: TS,
    });
    const published = await versions.publishDraft({
      routineId,
      authorId: author,
      publishedAt: TS,
      name: "Origin target",
    });
    return { routineId, published };
  }

  it("throws Program not found for a missing program id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const { routineId, published } = await seedPublishedRoutine(storage, author);
      const programs = new ProgramsRepository(storage);
      await expect(
        programs.setRoutineOrigin(id("missing-program"), {
          routineId,
          routineVersionId: published.id,
          usedAs: "used_as_is",
        }),
      ).rejects.toThrow(new ProgramRepositoryError("Program not found"));
    } finally {
      storage.close();
    }
  });

  it("throws Program is deleted for a soft-deleted program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const { routineId, published } = await seedPublishedRoutine(storage, author);
      const programs = new ProgramsRepository(storage);
      const programId = id("deleted-origin-prog");
      await programs.create({
        id: programId,
        createdBy: author,
        createdAt: TS,
      });
      await programs.softDelete(programId, TS);
      await expect(
        programs.setRoutineOrigin(programId, {
          routineId,
          routineVersionId: published.id,
          usedAs: "tweaked",
        }),
      ).rejects.toThrow(new ProgramRepositoryError("Program is deleted"));
    } finally {
      storage.close();
    }
  });
});
