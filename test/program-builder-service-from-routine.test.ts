import { describe, expect, it } from "vitest";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
} from "../src/services/programs/program-builder-service.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import {
  PractitionerRoutinesRepository,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
  versionInsertBindings,
  VERSION_INSERT_SQL,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const BODY_REGION_KNEE = "br-knee";

type PublishSeeds = {
  routine: string;
  draftVersion: string;
  row: string;
  name: string;
  hold_s?: number;
  secondRow?: string;
};

function errorSnapshot(err: unknown): {
  name: string;
  code: string;
  message: string;
} {
  expect(err).toBeInstanceOf(ProgramBuilderServiceError);
  const e = err as ProgramBuilderServiceError;
  return { name: e.name, code: e.code, message: e.message };
}

async function expectServiceRejection(
  fn: () => Promise<unknown>,
): Promise<{ name: string; code: string; message: string }> {
  try {
    await fn();
    throw new Error("expected rejection");
  } catch (err) {
    if (err instanceof Error && err.message === "expected rejection") {
      throw err;
    }
    return errorSnapshot(err);
  }
}

const DUPLICATE_ID_INVALID_INPUT_ERROR = {
  name: "ProgramBuilderServiceError",
  code: "invalid_input",
  message: "invalid_input",
} as const;

const ROW_ID_ALREADY_IN_USE_ERROR = {
  name: "ProgramBuilderServiceError",
  code: "invalid_input",
  message: "Program row id is already in use",
} as const;

const HOLD_S_RANGE_MESSAGE = "hold_s must be between 1 and 120";

const PRESCRIPTION_CATEGORY_ERROR = {
  name: "ProgramBuilderServiceError",
  code: "invalid_input",
  message: "prescriptionType is not allowed for this exercise category",
} as const;

const PROGRAM_NOT_FOUND_ERROR = {
  name: "ProgramBuilderServiceError",
  code: "program_not_found",
  message: "Program not found",
} as const;

const EXERCISE_NOT_FOUND_ERROR = {
  name: "ProgramBuilderServiceError",
  code: "exercise_not_found",
  message: "Exercise not found",
} as const;

const PRACTITIONER_NOT_FOUND_ERROR = {
  name: "ProgramBuilderServiceError",
  code: "practitioner_not_found",
  message: "Practitioner not found",
} as const;

const DESCRIPTION_MAX_MESSAGE = "Description must be at most 4000 characters";

async function assertCreateFromRoutineDidNotPersist(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  attemptedRowIds: string[],
) {
  const programs = new ProgramsRepository(storage);
  const rows = new ProgramRowsRepository(storage);
  expect(await programs.findById(id(programId))).toBeNull();
  const persistedForProgram = await storage.all<{ id: string }>(
    `SELECT id FROM program_rows WHERE program_id = ?`,
    [id(programId)],
  );
  expect(persistedForProgram).toHaveLength(0);
  for (const rowKey of attemptedRowIds) {
    const row = await rows.findById(id(rowKey));
    if (row) {
      expect(row.program_id).not.toBe(id(programId));
    }
  }
}

async function seedStrengtheningApprovedExercise(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  exerciseId: string,
  versionId: string,
  title = "Bridge",
) {
  await storage.run(
    "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
    [exerciseId, "strengthening", practitionerId, TS],
  );
  await storage.run(
    VERSION_INSERT_SQL,
    versionInsertBindings({
      id: versionId,
      exercise_id: exerciseId,
      status: "approved",
      approved_by: practitionerId,
      approved_at: TS,
      title,
    }),
  );
}

async function seedStretchApprovedExercise(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  exerciseId: string,
  versionId: string,
  versionNumber: number,
  title: string,
) {
  await storage.run(
    "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
    [exerciseId, "stretch", practitionerId, TS],
  );
  await storage.run(
    VERSION_INSERT_SQL,
    versionInsertBindings({
      id: versionId,
      exercise_id: exerciseId,
      version_number: versionNumber,
      status: "approved",
      approved_by: practitionerId,
      approved_at: TS,
      title,
    }),
  );
}

async function publishRoutine(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  author: string,
  seeds: PublishSeeds,
) {
  const routines = new RoutinesRepository(storage);
  const rows = new RoutineVersionRowsRepository(storage);
  const versions = new RoutineVersionsRepository(storage);
  await routines.createDraft({
    id: id(seeds.routine),
    draftVersionId: id(seeds.draftVersion),
    createdBy: author,
    createdAt: TS,
    bodyRegionId: BODY_REGION_KNEE,
  });
  await rows.replaceDraftRow({
    id: id(seeds.row),
    routineId: id(seeds.routine),
    authorId: author,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: {
      hold_s: seeds.hold_s ?? 30,
      per_day: { min: 1, max: 2 },
      days_per_week: 7,
    },
    draftUpdatedAt: TS,
  });
  if (seeds.secondRow) {
    await rows.replaceDraftRow({
      id: id(seeds.secondRow),
      routineId: id(seeds.routine),
      authorId: author,
      position: 1,
      exerciseId: FIXTURE_EXERCISE_ID,
      exerciseVersionId: FIXTURE_VERSION_ID,
      prescriptionType: "stretching",
      params: {
        hold_s: seeds.hold_s ?? 30,
        per_day: { min: 1, max: 2 },
        days_per_week: 7,
      },
      draftUpdatedAt: TS,
    });
  }
  return versions.publishDraft({
    routineId: id(seeds.routine),
    authorId: author,
    publishedAt: TS,
    name: seeds.name,
  });
}

async function deleteRoutineRecord(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  routineId: string,
) {
  const rid = id(routineId);
  await storage.run(
    `DELETE FROM practitioner_routine_rows WHERE practitioner_routine_id IN (
      SELECT id FROM practitioner_routines WHERE routine_id = ?
    )`,
    [rid],
  );
  await storage.run(`DELETE FROM practitioner_routines WHERE routine_id = ?`, [rid]);
  await storage.run(
    `DELETE FROM routine_version_rows WHERE routine_version_id IN (
      SELECT id FROM routine_versions WHERE routine_id = ?
    )`,
    [rid],
  );
  await storage.run(`DELETE FROM routine_versions WHERE routine_id = ?`, [rid]);
  await storage.run(`DELETE FROM routines WHERE id = ?`, [rid]);
}

async function seedApprovedExerciseForBuilder(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
) {
  await seedApprovedExerciseVersion(storage, practitionerId);
  await storage.run(
    `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
    [practitionerId, TS, FIXTURE_VERSION_ID],
  );
}

async function seedTwoPractitioners(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
) {
  const practitionerA = await seedPractitioner(storage, id("pract-a"), "a@example.com");
  const practitionerB = await seedPractitioner(storage, id("pract-b"), "b@example.com");
  await seedApprovedExerciseForBuilder(storage, practitionerA);
  return { practitionerA, practitionerB };
}

async function seedOpenExerciseRequest(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
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

async function expectUsedAsIs(
  service: ProgramBuilderService,
  practitionerId: string,
  programId: string,
): Promise<void> {
  const view = await service.getProgram(practitionerId, programId);
  expect(view.routine_origin?.used_as).toBe("used_as_is");
}

describe("ProgramBuilderService program from routine (DIDI-1019)", () => {
  it("copies community rows with pinned doses and prefilled routine name", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "comm-routine",
        draftVersion: "comm-rv-draft",
        row: "comm-rvr",
        name: "Community knee plan",
        hold_s: 25,
      });
      const result = await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-comm"),
        routineId: id("comm-routine"),
        source: "community",
        rowIds: [id("prog-row-comm")],
      });
      expect(result.program.name).toBe("Community knee plan");
      expect(result.program.routine_origin).toMatchObject({
        routine_id: id("comm-routine"),
        routine_name: "Community knee plan",
        used_as: "used_as_is",
      });
      expect(result.program.rows).toHaveLength(1);
      expect(result.program.rows[0]?.params.hold_s).toBe(25);
      expect(result.program.open_share_link).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("copies My copy rows when saved, not the newer community version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const v1 = await publishRoutine(storage, practitionerA, {
        routine: "copy-routine",
        draftVersion: "copy-rv1-draft",
        row: "copy-rvr1",
        name: "Copy source v1",
        hold_s: 20,
      });
      const my = new PractitionerRoutinesRepository(storage);
      await my.saveFrozenCopy({
        id: id("pr-copy"),
        practitionerId: practitionerB,
        routineId: id("copy-routine"),
        sourceRoutineVersionId: v1.id,
        savedAt: TS,
        rows: [
          {
            id: id("pr-row"),
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: { hold_s: 20, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      const versions = new RoutineVersionsRepository(storage);
      await versions.savePublishedVersion({
        id: id("copy-rv2"),
        routineId: id("copy-routine"),
        createdBy: practitionerA,
        createdAt: TS,
        name: "Copy source v2",
        copyFromVersionId: v1.id,
      });
      await storage.run(
        `UPDATE routine_version_rows SET params_json = ? WHERE routine_version_id = ?`,
        [
          JSON.stringify({
            hold_s: 99,
            per_day: { min: 1, max: 2 },
            days_per_week: 7,
          }),
          id("copy-rv2"),
        ],
      );
      const fromCopy = await service.createProgramFromRoutine(practitionerB, {
        programId: id("prog-my-copy"),
        routineId: id("copy-routine"),
        source: "my_copy",
        rowIds: [id("prog-row-my")],
      });
      expect(fromCopy.program.rows[0]?.params.hold_s).toBe(20);
      const fromCommunity = await service.createProgramFromRoutine(practitionerB, {
        programId: id("prog-community-latest"),
        routineId: id("copy-routine"),
        source: "community",
        rowIds: [id("prog-row-latest")],
      });
      expect(fromCommunity.program.rows[0]?.params.hold_s).toBe(99);
    } finally {
      storage.close();
    }
  });

  it("uses community version when my_copy is chosen but no My copy is saved", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "fallback-routine",
        draftVersion: "fallback-rv-draft",
        row: "fallback-rvr",
        name: "Fallback community name",
        hold_s: 44,
      });
      const created = await service.createProgramFromRoutine(practitionerB, {
        programId: id("prog-fallback"),
        routineId: id("fallback-routine"),
        source: "my_copy",
        rowIds: [id("prog-fallback-row")],
      });
      expect(created.program.rows[0]?.params.hold_s).toBe(44);
    } finally {
      storage.close();
    }
  });

  it("useRoutineForPatient matches createProgramFromRoutine for publish-ready draft", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "use-routine",
        draftVersion: "use-rv-draft",
        row: "use-rvr",
        name: "Use for patient name",
      });
      const created = await service.useRoutineForPatient(practitionerA, {
        programId: id("prog-use"),
        routineId: id("use-routine"),
        source: "community",
        rowIds: [id("prog-use-row")],
      });
      expect(created.program.auto_save_status).toEqual({ kind: "not_published_yet" });
      expect(created.program.name).toBe("Use for patient name");
    } finally {
      storage.close();
    }
  });

  it("returns invalid_input for the author own draft and program_not_found for missing, foreign, and deleted routines with matching errors per case", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const routines = new RoutinesRepository(storage);
      await routines.createDraft({
        id: id("draft-only"),
        draftVersionId: id("draft-ver"),
        createdBy: practitionerA,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      const authorDraftCreate = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-draft-create"),
          routineId: id("draft-only"),
          source: "community",
          rowIds: [],
        }),
      );
      const authorDraftUse = await expectServiceRejection(() =>
        service.useRoutineForPatient(practitionerA, {
          programId: id("prog-draft-use"),
          routineId: id("draft-only"),
          source: "community",
          rowIds: [],
        }),
      );
      const authorDraftStats = await expectServiceRejection(() =>
        service.getRoutineSentProgramStats(practitionerA, id("draft-only")),
      );
      expect(authorDraftCreate).toEqual(authorDraftUse);
      expect(authorDraftCreate).toEqual(authorDraftStats);
      expect(authorDraftCreate).toEqual(DUPLICATE_ID_INVALID_INPUT_ERROR);

      const missingId = id("missing-routine-id");
      const missingCreate = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerB, {
          programId: id("prog-missing-create"),
          routineId: missingId,
          source: "community",
          rowIds: [],
        }),
      );
      const missingUse = await expectServiceRejection(() =>
        service.useRoutineForPatient(practitionerB, {
          programId: id("prog-missing-use"),
          routineId: missingId,
          source: "community",
          rowIds: [],
        }),
      );
      const missingStats = await expectServiceRejection(() =>
        service.getRoutineSentProgramStats(practitionerB, missingId),
      );
      expect(missingCreate).toEqual(missingUse);
      expect(missingCreate).toEqual(missingStats);
      expect(missingCreate).toEqual(PROGRAM_NOT_FOUND_ERROR);

      const foreignCreate = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerB, {
          programId: id("prog-foreign-create"),
          routineId: id("draft-only"),
          source: "community",
          rowIds: [],
        }),
      );
      const foreignUse = await expectServiceRejection(() =>
        service.useRoutineForPatient(practitionerB, {
          programId: id("prog-foreign-use"),
          routineId: id("draft-only"),
          source: "community",
          rowIds: [],
        }),
      );
      const foreignStats = await expectServiceRejection(() =>
        service.getRoutineSentProgramStats(practitionerB, id("draft-only")),
      );
      expect(foreignCreate).toEqual(missingCreate);
      expect(foreignUse).toEqual(missingUse);
      expect(foreignStats).toEqual(missingStats);

      await publishRoutine(storage, practitionerA, {
        routine: "deleted-routine",
        draftVersion: "deleted-rv-draft",
        row: "deleted-rvr",
        name: "Deleted routine name",
      });
      await deleteRoutineRecord(storage, "deleted-routine");
      const deletedCreate = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-deleted-create"),
          routineId: id("deleted-routine"),
          source: "community",
          rowIds: [id("deleted-row")],
        }),
      );
      const deletedUse = await expectServiceRejection(() =>
        service.useRoutineForPatient(practitionerA, {
          programId: id("prog-deleted-use"),
          routineId: id("deleted-routine"),
          source: "community",
          rowIds: [id("deleted-row-use")],
        }),
      );
      const deletedStats = await expectServiceRejection(() =>
        service.getRoutineSentProgramStats(practitionerA, id("deleted-routine")),
      );
      expect(deletedCreate).toEqual(missingCreate);
      expect(deletedUse).toEqual(missingUse);
      expect(deletedStats).toEqual(missingStats);
    } finally {
      storage.close();
    }
  });

  it("keeps program rows when the community routine version advances", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const v1 = await publishRoutine(storage, practitionerA, {
        routine: "pin-routine",
        draftVersion: "pin-rv1",
        row: "pin-rvr1",
        name: "Pinned origin",
        hold_s: 11,
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-pin"),
        routineId: id("pin-routine"),
        source: "community",
        rowIds: [id("prog-pin-row")],
      });
      const versions = new RoutineVersionsRepository(storage);
      await versions.savePublishedVersion({
        id: id("pin-rv2"),
        routineId: id("pin-routine"),
        createdBy: practitionerA,
        createdAt: TS,
        name: "Pinned origin v2",
        copyFromVersionId: v1.id,
      });
      await storage.run(
        `UPDATE routine_version_rows SET params_json = ? WHERE routine_version_id = ?`,
        [
          JSON.stringify({
            hold_s: 88,
            per_day: { min: 1, max: 2 },
            days_per_week: 7,
          }),
          id("pin-rv2"),
        ],
      );
      const reloaded = await service.getProgram(practitionerA, id("prog-pin"));
      expect(reloaded.rows[0]?.params.hold_s).toBe(11);
      expect(reloaded.routine_origin?.routine_version_id).toBe(v1.id);
    } finally {
      storage.close();
    }
  });

  it("filters by origin and finds programs only by routine version name after renaming away from the routine title", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "search-routine",
        draftVersion: "search-rv-draft",
        row: "search-rvr",
        name: "Zeta routine search token only",
      });
      await service.createProgram(practitionerA, {
        programId: id("prog-scratch"),
        name: "Scratch only",
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-from-routine"),
        routineId: id("search-routine"),
        source: "community",
        rowIds: [id("prog-from-row")],
      });
      await service.updateProgramName(
        practitionerA,
        id("prog-from-routine"),
        "Program title with no zeta token",
      );
      await service.createProgramFromRoutine(practitionerB, {
        programId: id("prog-b-same-routine"),
        routineId: id("search-routine"),
        source: "community",
        rowIds: [id("prog-b-row")],
      });
      const fromRoutine = await service.listPrograms(practitionerA, {
        originFilter: "from_routine",
      });
      expect(fromRoutine.items.map((item) => item.program_id)).toEqual([
        id("prog-from-routine"),
      ]);
      const fromScratch = await service.listPrograms(practitionerA, {
        originFilter: "from_scratch",
      });
      expect(fromScratch.items.map((item) => item.program_id)).toEqual([
        id("prog-scratch"),
      ]);
      const routineNameQuery = "Zeta routine search token only";
      const byRoutineName = await service.listPrograms(practitionerA, {
        searchQuery: routineNameQuery,
      });
      expect(byRoutineName.items.map((item) => item.program_id)).toEqual([
        id("prog-from-routine"),
      ]);
      expect(
        byRoutineName.items.some(
          (item) => item.program_id === id("prog-b-same-routine"),
        ),
      ).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("counts only the caller published active copies in published_at order", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const programs = new ProgramsRepository(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "sent-routine",
        draftVersion: "sent-rv-draft",
        row: "sent-rvr",
        name: "Sent stats routine",
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-sent-first"),
        routineId: id("sent-routine"),
        source: "community",
        rowIds: [id("sent-row-first")],
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-sent-second"),
        routineId: id("sent-routine"),
        source: "community",
        rowIds: [id("sent-row-second")],
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-sent-deleted"),
        routineId: id("sent-routine"),
        source: "community",
        rowIds: [id("sent-row-deleted")],
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-sent-unpublished"),
        routineId: id("sent-routine"),
        source: "community",
        rowIds: [id("sent-row-unpublished")],
      });
      await service.createProgramFromRoutine(practitionerB, {
        programId: id("prog-sent-other"),
        routineId: id("sent-routine"),
        source: "community",
        rowIds: [id("sent-row-other")],
      });
      await programs.publish(id("prog-sent-first"), "2026-04-01T10:00:00.000Z");
      await programs.publish(id("prog-sent-second"), "2026-04-02T10:00:00.000Z");
      await programs.publish(id("prog-sent-deleted"), "2026-04-03T10:00:00.000Z");
      await programs.publish(id("prog-sent-other"), "2026-04-04T10:00:00.000Z");
      await programs.softDelete(id("prog-sent-deleted"), TS);
      const first = await programs.findById(id("prog-sent-first"));
      const second = await programs.findById(id("prog-sent-second"));
      const stats = await service.getRoutineSentProgramStats(
        practitionerA,
        id("sent-routine"),
      );
      expect(stats.sent_count).toBe(2);
      expect(stats.codes).toEqual([second!.code, first!.code]);
    } finally {
      storage.close();
    }
  });

  it("leaves routine origin null when a scratch program is edited", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, {
        programId: id("prog-scratch-edit"),
        name: "Scratch program",
      });
      await service.updateProgramName(
        practitionerA,
        id("prog-scratch-edit"),
        "Renamed scratch",
      );
      const view = await service.getProgram(practitionerA, id("prog-scratch-edit"));
      expect(view.routine_origin).toBeNull();
      const programs = new ProgramsRepository(storage);
      const record = await programs.findById(id("prog-scratch-edit"));
      expect(record?.source_routine_origin).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("updateProgramName marks routine origin tweaked when still used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "tweak-name-routine",
        draftVersion: "tweak-name-draft",
        row: "tweak-name-rvr",
        name: "Tweak name routine",
      });
      const programId = id("prog-tweak-name");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("tweak-name-routine"),
        source: "community",
        rowIds: [id("prog-tweak-name-row")],
      });
      await expectUsedAsIs(service, practitionerA, programId);
      await service.updateProgramName(practitionerA, programId, "Renamed title");
      const view = await service.getProgram(practitionerA, programId);
      expect(view.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("addExerciseRow marks routine origin tweaked when still used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "tweak-add-routine",
        draftVersion: "tweak-add-draft",
        row: "tweak-add-rvr",
        name: "Tweak add routine",
      });
      const programId = id("prog-tweak-add");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("tweak-add-routine"),
        source: "community",
        rowIds: [id("prog-tweak-add-row")],
      });
      await expectUsedAsIs(service, practitionerA, programId);
      await service.addExerciseRow(practitionerA, programId, {
        rowId: id("tweak-add-extra"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const view = await service.getProgram(practitionerA, programId);
      expect(view.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("addPlaceholderRow marks routine origin tweaked when still used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await seedOpenExerciseRequest(
        storage,
        practitionerA,
        id("req-tweak-ph"),
        "Pending move",
      );
      await publishRoutine(storage, practitionerA, {
        routine: "tweak-ph-routine",
        draftVersion: "tweak-ph-draft",
        row: "tweak-ph-rvr",
        name: "Tweak placeholder routine",
      });
      const programId = id("prog-tweak-ph");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("tweak-ph-routine"),
        source: "community",
        rowIds: [id("prog-tweak-ph-row")],
      });
      await expectUsedAsIs(service, practitionerA, programId);
      await service.addPlaceholderRow(practitionerA, programId, {
        rowId: id("tweak-ph-new-row"),
        exerciseRequestId: id("req-tweak-ph"),
        prescriptionType: "stretching",
      });
      const view = await service.getProgram(practitionerA, programId);
      expect(view.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("updateRow on an exercise row marks routine origin tweaked when still used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "tweak-dose-routine",
        draftVersion: "tweak-dose-draft",
        row: "tweak-dose-rvr",
        name: "Tweak dose routine",
      });
      const programId = id("prog-tweak-dose");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("tweak-dose-routine"),
        source: "community",
        rowIds: [id("prog-tweak-dose-row")],
      });
      await expectUsedAsIs(service, practitionerA, programId);
      const before = await service.getProgram(practitionerA, programId);
      await service.updateRow(practitionerA, programId, before.rows[0]!.id, {
        params: { hold_s: 5 },
      });
      const view = await service.getProgram(practitionerA, programId);
      expect(view.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("updateRow on a placeholder row marks routine origin tweaked when still used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await seedOpenExerciseRequest(
        storage,
        practitionerA,
        id("req-ph-update"),
        "Pending stretch",
      );
      await publishRoutine(storage, practitionerA, {
        routine: "tweak-ph-up-routine",
        draftVersion: "tweak-ph-up-draft",
        row: "tweak-ph-up-rvr",
        name: "Tweak placeholder update routine",
      });
      const programId = id("prog-tweak-ph-up");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("tweak-ph-up-routine"),
        source: "community",
        rowIds: [id("prog-tweak-ph-up-row")],
      });
      const rows = new ProgramRowsRepository(storage);
      await rows.replaceRow({
        id: id("prog-tweak-ph-arranged"),
        programId,
        position: 1,
        exerciseRequestId: id("req-ph-update"),
        prescriptionType: "stretching",
        params: { hold_s: 10 },
        textSnapshot: { title: "Pending stretch" },
        draftUpdatedAt: TS,
      });
      await expectUsedAsIs(service, practitionerA, programId);
      await service.updateRow(practitionerA, programId, id("prog-tweak-ph-arranged"), {
        note: "Placeholder note tweak",
      });
      const view = await service.getProgram(practitionerA, programId);
      expect(view.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("removeRow marks routine origin tweaked when still used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "tweak-remove-routine",
        draftVersion: "tweak-remove-draft",
        row: "tweak-remove-rvr1",
        secondRow: "tweak-remove-rvr2",
        name: "Tweak remove routine",
      });
      const programId = id("prog-tweak-remove");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("tweak-remove-routine"),
        source: "community",
        rowIds: [id("prog-tweak-remove-row1"), id("prog-tweak-remove-row2")],
      });
      await expectUsedAsIs(service, practitionerA, programId);
      await service.removeRow(practitionerA, programId, id("prog-tweak-remove-row2"));
      const view = await service.getProgram(practitionerA, programId);
      expect(view.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("reorderRows marks routine origin tweaked when still used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "tweak-reorder-routine",
        draftVersion: "tweak-reorder-draft",
        row: "tweak-reorder-rvr1",
        secondRow: "tweak-reorder-rvr2",
        name: "Tweak reorder routine",
      });
      const programId = id("prog-tweak-reorder");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("tweak-reorder-routine"),
        source: "community",
        rowIds: [id("prog-tweak-reorder-row1"), id("prog-tweak-reorder-row2")],
      });
      await expectUsedAsIs(service, practitionerA, programId);
      await service.reorderRows(practitionerA, programId, [
        id("prog-tweak-reorder-row2"),
        id("prog-tweak-reorder-row1"),
      ]);
      const view = await service.getProgram(practitionerA, programId);
      expect(view.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("duplicateRow marks routine origin tweaked when still used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "tweak-dup-routine",
        draftVersion: "tweak-dup-draft",
        row: "tweak-dup-rvr",
        name: "Tweak duplicate routine",
      });
      const programId = id("prog-tweak-dup");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("tweak-dup-routine"),
        source: "community",
        rowIds: [id("prog-tweak-dup-row")],
      });
      await expectUsedAsIs(service, practitionerA, programId);
      await service.duplicateRow(practitionerA, programId, {
        sourceRowId: id("prog-tweak-dup-row"),
        newRowId: id("prog-tweak-dup-copy-row"),
      });
      const view = await service.getProgram(practitionerA, programId);
      expect(view.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("applyLibraryUpdateToRow marks routine origin tweaked when still used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "lib-tweak-routine",
        draftVersion: "lib-tweak-draft",
        row: "lib-tweak-rvr",
        name: "Library tweak routine",
      });
      const programId = id("prog-lib-tweak");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("lib-tweak-routine"),
        source: "community",
        rowIds: [id("prog-lib-tweak-row")],
      });
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: id("ver-lib-2"),
          version_number: 2,
          status: "approved",
          approved_by: practitionerA,
          approved_at: TS,
          title: "Heel slide v2",
        }),
      );
      await expectUsedAsIs(service, practitionerA, programId);
      await service.applyLibraryUpdateToRow(
        practitionerA,
        programId,
        id("prog-lib-tweak-row"),
      );
      const view = await service.getProgram(practitionerA, programId);
      expect(view.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("createProgram from scratch still leaves routine origin null", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const created = await service.createProgram(practitionerA, {
        programId: id("prog-scratch-origin"),
        name: "Scratch program",
      });
      expect(created.program.routine_origin).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("does not create a program when a routine row pinned version is invalid", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "txn-routine",
        draftVersion: "txn-rv-draft",
        row: "txn-rvr1",
        secondRow: "txn-rvr2",
        name: "Txn routine",
      });
      const strengtheningId = id("txn-strength-ex");
      const strengtheningVersion = id("txn-strength-ver");
      await storage.run(
        "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
        [strengtheningId, "strengthening", practitionerA, TS],
      );
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: strengtheningVersion,
          exercise_id: strengtheningId,
          status: "approved",
          approved_by: practitionerA,
          approved_at: TS,
          title: "Txn bridge",
        }),
      );
      await storage.run(
        `UPDATE routine_version_rows SET exercise_version_id = ? WHERE id = ?`,
        [strengtheningVersion, id("txn-rvr2")],
      );
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-txn-fail"),
          routineId: id("txn-routine"),
          source: "community",
          rowIds: [id("txn-row-1"), id("txn-row-2")],
        }),
      );
      expect(err).toEqual(EXERCISE_NOT_FOUND_ERROR);
      await assertCreateFromRoutineDidNotPersist(storage, "prog-txn-fail", [
        "txn-row-1",
        "txn-row-2",
      ]);
    } finally {
      storage.close();
    }
  });

  it("rejects duplicate rowIds before create with invalid_input and leaves no program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "dup-rowids-routine",
        draftVersion: "dup-rowids-rv",
        row: "dup-rowids-rvr1",
        secondRow: "dup-rowids-rvr2",
        name: "Dup row ids routine",
      });
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-dup-rowids"),
          routineId: id("dup-rowids-routine"),
          source: "community",
          rowIds: [id("dup-row-a"), id("dup-row-a")],
        }),
      );
      expect(err).toEqual(DUPLICATE_ID_INVALID_INPUT_ERROR);
      await assertCreateFromRoutineDidNotPersist(storage, "prog-dup-rowids", [
        "dup-row-a",
      ]);
    } finally {
      storage.close();
    }
  });

  it("rejects a row id already in use before create with identical errors for own and foreign callers", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "row-collision-routine",
        draftVersion: "row-collision-rv",
        row: "row-collision-rvr",
        name: "Row collision routine",
      });
      await service.createProgram(practitionerA, {
        programId: id("prog-existing-row-owner"),
        name: "Existing row owner",
      });
      await service.addExerciseRow(practitionerA, id("prog-existing-row-owner"), {
        rowId: id("shared-program-row"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const ownErr = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-row-collision-own"),
          routineId: id("row-collision-routine"),
          source: "community",
          rowIds: [id("shared-program-row")],
        }),
      );
      const foreignErr = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerB, {
          programId: id("prog-row-collision-foreign"),
          routineId: id("row-collision-routine"),
          source: "community",
          rowIds: [id("shared-program-row")],
        }),
      );
      expect(ownErr).toEqual(ROW_ID_ALREADY_IN_USE_ERROR);
      expect(foreignErr).toEqual(ownErr);
      await assertCreateFromRoutineDidNotPersist(storage, "prog-row-collision-own", [
        "shared-program-row",
      ]);
      await assertCreateFromRoutineDidNotPersist(
        storage,
        "prog-row-collision-foreign",
        ["shared-program-row"],
      );
    } finally {
      storage.close();
    }
  });

  it("rejects a program id already in use before create with identical errors for own and foreign callers", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "prog-collision-routine",
        draftVersion: "prog-collision-rv",
        row: "prog-collision-rvr",
        name: "Program collision routine",
      });
      await service.createProgram(practitionerA, {
        programId: id("shared-program-id"),
        name: "Taken program id",
      });
      const ownErr = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("shared-program-id"),
          routineId: id("prog-collision-routine"),
          source: "community",
          rowIds: [id("prog-collision-row-own")],
        }),
      );
      const foreignErr = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerB, {
          programId: id("shared-program-id"),
          routineId: id("prog-collision-routine"),
          source: "community",
          rowIds: [id("prog-collision-row-foreign")],
        }),
      );
      expect(ownErr).toEqual(DUPLICATE_ID_INVALID_INPUT_ERROR);
      expect(foreignErr).toEqual(ownErr);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      expect(await rows.findById(id("prog-collision-row-own"))).toBeNull();
      expect(await rows.findById(id("prog-collision-row-foreign"))).toBeNull();
      expect((await programs.findById(id("shared-program-id")))?.name).toBe(
        "Taken program id",
      );
    } finally {
      storage.close();
    }
  });

  it("rejects out-of-range params when routine rows load before create and leaves no program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "bad-params-routine",
        draftVersion: "bad-params-rv",
        row: "bad-params-rvr",
        name: "Bad params routine",
      });
      await storage.run(
        `UPDATE routine_version_rows SET params_json = ? WHERE id = ?`,
        [
          JSON.stringify({
            hold_s: -1,
            per_day: { min: 1, max: 2 },
            days_per_week: 7,
          }),
          id("bad-params-rvr"),
        ],
      );
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-bad-params"),
          routineId: id("bad-params-routine"),
          source: "community",
          rowIds: [id("bad-params-row")],
        }),
      );
      expect(err).toEqual({
        name: "ProgramBuilderServiceError",
        code: "invalid_input",
        message: HOLD_S_RANGE_MESSAGE,
      });
      await assertCreateFromRoutineDidNotPersist(storage, "prog-bad-params", [
        "bad-params-row",
      ]);
    } finally {
      storage.close();
    }
  });

  it("rejects param keys disallowed for the prescription type before create and leaves no program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "wrong-key-routine",
        draftVersion: "wrong-key-rv",
        row: "wrong-key-rvr",
        name: "Wrong key routine",
      });
      await storage.run(
        `UPDATE routine_version_rows SET params_json = ? WHERE id = ?`,
        [
          JSON.stringify({
            hold_s: 30,
            reps: 10,
            per_day: { min: 1, max: 2 },
            days_per_week: 7,
          }),
          id("wrong-key-rvr"),
        ],
      );
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-wrong-key"),
          routineId: id("wrong-key-routine"),
          source: "community",
          rowIds: [id("wrong-key-row")],
        }),
      );
      expect(err).toEqual({
        name: "ProgramBuilderServiceError",
        code: "invalid_input",
        message: "reps is not allowed for prescription type stretching",
      });
      await assertCreateFromRoutineDidNotPersist(storage, "prog-wrong-key", [
        "wrong-key-row",
      ]);
    } finally {
      storage.close();
    }
  });

  it("rejects rowIds count mismatch before create with invalid_input and leaves no program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "row-count-routine",
        draftVersion: "row-count-rv",
        row: "row-count-rvr",
        name: "Row count routine",
      });
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-row-count"),
          routineId: id("row-count-routine"),
          source: "community",
          rowIds: [id("row-count-a"), id("row-count-b")],
        }),
      );
      expect(err).toEqual(DUPLICATE_ID_INVALID_INPUT_ERROR);
      await assertCreateFromRoutineDidNotPersist(storage, "prog-row-count", [
        "row-count-a",
        "row-count-b",
      ]);
    } finally {
      storage.close();
    }
  });

  it("rejects prescriptionType not allowed for exercise category before create and leaves no program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const strengthEx = id("cat-strength-ex");
      const strengthVer = id("cat-strength-ver");
      await seedStrengtheningApprovedExercise(
        storage,
        practitionerA,
        strengthEx,
        strengthVer,
      );
      await publishRoutine(storage, practitionerA, {
        routine: "cat-mismatch-routine",
        draftVersion: "cat-mismatch-rv",
        row: "cat-mismatch-rvr",
        name: "Category mismatch routine",
      });
      await storage.run(
        `UPDATE routine_version_rows SET exercise_id = ?, exercise_version_id = ?, prescription_type = ? WHERE id = ?`,
        [strengthEx, strengthVer, "stretching", id("cat-mismatch-rvr")],
      );
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-cat-mismatch"),
          routineId: id("cat-mismatch-routine"),
          source: "community",
          rowIds: [id("cat-mismatch-row")],
        }),
      );
      expect(err).toEqual(PRESCRIPTION_CATEGORY_ERROR);
      await assertCreateFromRoutineDidNotPersist(storage, "prog-cat-mismatch", [
        "cat-mismatch-row",
      ]);
    } finally {
      storage.close();
    }
  });

  it("validate-first: invalid last source row leaves no program and no rows with the full error", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const strengthEx = id("vf-strength-ex");
      const strengthVer = id("vf-strength-ver");
      await seedStrengtheningApprovedExercise(
        storage,
        practitionerA,
        strengthEx,
        strengthVer,
      );
      await publishRoutine(storage, practitionerA, {
        routine: "validate-first-routine",
        draftVersion: "validate-first-rv",
        row: "validate-first-rvr1",
        secondRow: "validate-first-rvr2",
        name: "Validate first routine",
      });
      await storage.run(
        `UPDATE routine_version_rows SET exercise_id = ?, exercise_version_id = ?, prescription_type = ? WHERE id = ?`,
        [strengthEx, strengthVer, "stretching", id("validate-first-rvr2")],
      );
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-validate-first"),
          routineId: id("validate-first-routine"),
          source: "community",
          rowIds: [id("vf-row-1"), id("vf-row-2")],
        }),
      );
      expect(err).toEqual(PRESCRIPTION_CATEGORY_ERROR);
      await assertCreateFromRoutineDidNotPersist(storage, "prog-validate-first", [
        "vf-row-1",
        "vf-row-2",
      ]);
    } finally {
      storage.close();
    }
  });

  it("rejects oversize row text snapshot before the first write and leaves no program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const ex2 = id("snap-ex-2");
      const ver2 = id("snap-ver-2");
      await seedStretchApprovedExercise(
        storage,
        practitionerA,
        ex2,
        ver2,
        1,
        "Second stretch",
      );
      await storage.run(`UPDATE exercise_versions SET description = ? WHERE id = ?`, [
        "x".repeat(4001),
        ver2,
      ]);
      await publishRoutine(storage, practitionerA, {
        routine: "snap-routine",
        draftVersion: "snap-rv",
        row: "snap-rvr1",
        secondRow: "snap-rvr2",
        name: "Snapshot limit routine",
      });
      await storage.run(
        `UPDATE routine_version_rows SET exercise_id = ?, exercise_version_id = ? WHERE id = ?`,
        [ex2, ver2, id("snap-rvr2")],
      );
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-snap-fail"),
          routineId: id("snap-routine"),
          source: "community",
          rowIds: [id("snap-row-1"), id("snap-row-2")],
        }),
      );
      expect(err).toEqual({
        name: "ProgramBuilderServiceError",
        code: "invalid_input",
        message: DESCRIPTION_MAX_MESSAGE,
      });
      await assertCreateFromRoutineDidNotPersist(storage, "prog-snap-fail", [
        "snap-row-1",
        "snap-row-2",
      ]);
    } finally {
      storage.close();
    }
  });

  it("compacts copied row positions so a later addExerciseRow keeps every row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "gap-pos-routine",
        draftVersion: "gap-pos-rv",
        row: "gap-pos-rvr1",
        secondRow: "gap-pos-rvr2",
        name: "Gap positions routine",
      });
      await storage.run(`UPDATE routine_version_rows SET position = 2 WHERE id = ?`, [
        id("gap-pos-rvr2"),
      ]);
      const created = await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-gap-pos"),
        routineId: id("gap-pos-routine"),
        source: "community",
        rowIds: [id("gap-row-1"), id("gap-row-2")],
      });
      expect(created.program.rows.map((row) => row.position)).toEqual([0, 1]);
      await service.addExerciseRow(practitionerA, id("prog-gap-pos"), {
        rowId: id("gap-row-added"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const view = await service.getProgram(practitionerA, id("prog-gap-pos"));
      expect(view.rows.map((row) => row.id).sort()).toEqual(
        [id("gap-row-1"), id("gap-row-2"), id("gap-row-added")].sort(),
      );
      expect(view.rows.map((row) => row.position)).toEqual([0, 1, 2]);
    } finally {
      storage.close();
    }
  });

  it("does not apply another practitioner saved My copy when the caller has no saved copy", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const v1 = await publishRoutine(storage, practitionerA, {
        routine: "iso-my-routine",
        draftVersion: "iso-my-rv1",
        row: "iso-my-rvr1",
        name: "Isolation my copy v1",
        hold_s: 10,
      });
      const my = new PractitionerRoutinesRepository(storage);
      await my.saveFrozenCopy({
        id: id("pr-b-only"),
        practitionerId: practitionerB,
        routineId: id("iso-my-routine"),
        sourceRoutineVersionId: v1.id,
        savedAt: TS,
        rows: [
          {
            id: id("pr-b-row"),
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: { hold_s: 77, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      const versions = new RoutineVersionsRepository(storage);
      await versions.savePublishedVersion({
        id: id("iso-my-rv2"),
        routineId: id("iso-my-routine"),
        createdBy: practitionerA,
        createdAt: TS,
        name: "Isolation my copy v2",
        copyFromVersionId: v1.id,
      });
      await storage.run(
        `UPDATE routine_version_rows SET params_json = ? WHERE routine_version_id = ?`,
        [
          JSON.stringify({
            hold_s: 22,
            per_day: { min: 1, max: 2 },
            days_per_week: 7,
          }),
          id("iso-my-rv2"),
        ],
      );
      const created = await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-a-my-copy"),
        routineId: id("iso-my-routine"),
        source: "my_copy",
        rowIds: [id("iso-my-prog-row")],
      });
      expect(created.program.rows[0]?.params.hold_s).toBe(22);
      expect(created.program.rows[0]?.params.hold_s).not.toBe(77);
    } finally {
      storage.close();
    }
  });

  it("rejects a row pinned to a draft exercise version before create with exercise_not_found", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "draft-pin-routine",
        draftVersion: "draft-pin-rv",
        row: "draft-pin-rvr",
        name: "Draft pinned routine",
      });
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: id("draft-pin-ver-newer"),
          exercise_id: FIXTURE_EXERCISE_ID,
          version_number: 2,
          status: "approved",
          approved_by: practitionerA,
          approved_at: TS,
          title: "Heel slide newer approved",
        }),
      );
      await storage.run(
        `UPDATE exercise_versions SET status = 'draft', approved_by = NULL, approved_at = NULL WHERE id = ?`,
        [FIXTURE_VERSION_ID],
      );
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-draft-pin"),
          routineId: id("draft-pin-routine"),
          source: "community",
          rowIds: [id("draft-pin-row")],
        }),
      );
      expect(err).toEqual(EXERCISE_NOT_FOUND_ERROR);
      await assertCreateFromRoutineDidNotPersist(storage, "prog-draft-pin", [
        "draft-pin-row",
      ]);
    } finally {
      storage.close();
    }
  });

  it("rejects createProgramFromRoutine for an unknown practitioner id", async () => {
    const storage = await openMigratedDatabase();
    try {
      await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(id("practitioner-missing"), {
          programId: id("prog-no-practitioner"),
          routineId: id("any-routine"),
          source: "community",
          rowIds: [id("any-row")],
        }),
      );
      expect(err).toEqual(PRACTITIONER_NOT_FOUND_ERROR);
    } finally {
      storage.close();
    }
  });

  it("rejects a soft-deleted program id before create with invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const programs = new ProgramsRepository(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "soft-id-routine",
        draftVersion: "soft-id-rv",
        row: "soft-id-rvr",
        name: "Soft id routine",
      });
      await service.createProgram(practitionerA, {
        programId: id("prog-soft-deleted-id"),
        name: "Taken then deleted",
      });
      await programs.softDelete(id("prog-soft-deleted-id"), TS);
      const err = await expectServiceRejection(() =>
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-soft-deleted-id"),
          routineId: id("soft-id-routine"),
          source: "community",
          rowIds: [id("soft-id-row")],
        }),
      );
      expect(err).toEqual(DUPLICATE_ID_INVALID_INPUT_ERROR);
      const rows = new ProgramRowsRepository(storage);
      expect(await rows.findById(id("soft-id-row"))).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("copies three pinned routine rows with full field fidelity for community and My copy sources", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const exA = id("tri-ex-a");
      const exB = id("tri-ex-b");
      const exC = id("tri-ex-c");
      const verA1 = id("tri-ver-a1");
      const verA2 = id("tri-ver-a2");
      const verB1 = id("tri-ver-b1");
      const verB2 = id("tri-ver-b2");
      const verC1 = id("tri-ver-c1");
      const verC2 = id("tri-ver-c2");
      await seedStretchApprovedExercise(
        storage,
        practitionerA,
        exA,
        verA1,
        1,
        "Row A v1",
      );
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: verA2,
          exercise_id: exA,
          version_number: 2,
          status: "approved",
          approved_by: practitionerA,
          approved_at: TS,
          title: "Row A v2",
        }),
      );
      await seedStrengtheningApprovedExercise(
        storage,
        practitionerA,
        exB,
        verB1,
        "Row B v1",
      );
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: verB2,
          exercise_id: exB,
          version_number: 2,
          status: "approved",
          approved_by: practitionerA,
          approved_at: TS,
          title: "Row B v2",
        }),
      );
      await seedStretchApprovedExercise(
        storage,
        practitionerA,
        exC,
        verC1,
        1,
        "Row C v1",
      );
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: verC2,
          exercise_id: exC,
          version_number: 2,
          status: "approved",
          approved_by: practitionerA,
          approved_at: TS,
          title: "Row C v2",
        }),
      );
      const routines = new RoutinesRepository(storage);
      const rvRows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      await routines.createDraft({
        id: id("tri-routine"),
        draftVersionId: id("tri-rv1-draft"),
        createdBy: practitionerA,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      const paramsA = {
        hold_s: 11,
        per_day: { min: 1, max: 2 },
        days_per_week: 5,
      };
      const paramsB = {
        hold_s: 45,
        sets: 3,
        reps: 10,
        days_per_week: 4,
      };
      const paramsC = {
        hold_s: 22,
        per_day: { min: 1, max: 2 },
        days_per_week: 6,
      };
      await rvRows.replaceDraftRow({
        id: id("tri-rvr1"),
        routineId: id("tri-routine"),
        authorId: practitionerA,
        position: 0,
        exerciseId: exA,
        exerciseVersionId: verA1,
        prescriptionType: "stretching",
        params: paramsA,
        draftUpdatedAt: TS,
      });
      await rvRows.replaceDraftRow({
        id: id("tri-rvr2"),
        routineId: id("tri-routine"),
        authorId: practitionerA,
        position: 1,
        exerciseId: exB,
        exerciseVersionId: verB1,
        prescriptionType: "isometric",
        params: paramsB,
        draftUpdatedAt: TS,
      });
      await rvRows.replaceDraftRow({
        id: id("tri-rvr3"),
        routineId: id("tri-routine"),
        authorId: practitionerA,
        position: 2,
        exerciseId: exC,
        exerciseVersionId: verC1,
        prescriptionType: "stretching",
        params: paramsC,
        draftUpdatedAt: TS,
      });
      const v1 = await versions.publishDraft({
        routineId: id("tri-routine"),
        authorId: practitionerA,
        publishedAt: TS,
        name: "Three row v1",
      });
      const my = new PractitionerRoutinesRepository(storage);
      await my.saveFrozenCopy({
        id: id("pr-tri-b"),
        practitionerId: practitionerB,
        routineId: id("tri-routine"),
        sourceRoutineVersionId: v1.id,
        savedAt: TS,
        rows: [
          {
            id: id("pr-tri-row1"),
            position: 0,
            exerciseId: exA,
            exerciseVersionId: verA1,
            prescriptionType: "stretching",
            params: paramsA,
          },
          {
            id: id("pr-tri-row2"),
            position: 1,
            exerciseId: exB,
            exerciseVersionId: verB1,
            prescriptionType: "isometric",
            params: paramsB,
          },
          {
            id: id("pr-tri-row3"),
            position: 2,
            exerciseId: exC,
            exerciseVersionId: verC1,
            prescriptionType: "stretching",
            params: paramsC,
          },
        ],
      });
      await versions.savePublishedVersion({
        id: id("tri-rv2"),
        routineId: id("tri-routine"),
        createdBy: practitionerA,
        createdAt: TS,
        name: "Three row v2",
        copyFromVersionId: v1.id,
      });
      const v2Rows = await rvRows.listForVersion(id("tri-rv2"));
      expect(v2Rows).toHaveLength(3);
      await storage.run(
        `UPDATE routine_version_rows SET exercise_version_id = ?, params_json = ? WHERE id = ?`,
        [
          verA2,
          JSON.stringify({ hold_s: 99, per_day: { min: 2, max: 3 }, days_per_week: 3 }),
          v2Rows[0]!.id,
        ],
      );
      await storage.run(
        `UPDATE routine_version_rows SET exercise_version_id = ?, prescription_type = ?, params_json = ? WHERE id = ?`,
        [
          verB2,
          "concentric",
          JSON.stringify({ reps: 8, sets: 2, hold_s: 10, days_per_week: 3 }),
          v2Rows[1]!.id,
        ],
      );
      await storage.run(
        `UPDATE routine_version_rows SET exercise_version_id = ?, params_json = ? WHERE id = ?`,
        [
          verC2,
          JSON.stringify({ hold_s: 88, per_day: { min: 2, max: 3 }, days_per_week: 3 }),
          v2Rows[2]!.id,
        ],
      );

      const expectMyCopyRows = (
        view: Awaited<ReturnType<ProgramBuilderService["getProgram"]>>,
        rowIds: string[],
      ) => {
        expect(view.routine_origin).toEqual({
          routine_id: id("tri-routine"),
          routine_version_id: v1.id,
          routine_version_number: 1,
          routine_name: "Three row v1",
          used_as: "used_as_is",
        });
        expect(view.rows).toHaveLength(3);
        expect(view.rows.map((row) => row.id)).toEqual(rowIds);
        expect(view.rows.map((row) => row.position)).toEqual([0, 1, 2]);
        expect(view.rows[0]).toMatchObject({
          exercise_id: exA,
          exercise_version_id: verA1,
          prescription_type: "stretching",
          params: paramsA,
        });
        expect(view.rows[1]).toMatchObject({
          exercise_id: exB,
          exercise_version_id: verB1,
          prescription_type: "isometric",
          params: paramsB,
        });
        expect(view.rows[2]).toMatchObject({
          exercise_id: exC,
          exercise_version_id: verC1,
          prescription_type: "stretching",
          params: paramsC,
        });
      };

      const expectCommunityRows = (
        view: Awaited<ReturnType<ProgramBuilderService["getProgram"]>>,
        rowIds: string[],
      ) => {
        expect(view.routine_origin).toEqual({
          routine_id: id("tri-routine"),
          routine_version_id: id("tri-rv2"),
          routine_version_number: 2,
          routine_name: "Three row v2",
          used_as: "used_as_is",
        });
        expect(view.rows).toHaveLength(3);
        expect(view.rows.map((row) => row.id)).toEqual(rowIds);
        expect(view.rows.map((row) => row.position)).toEqual([0, 1, 2]);
        expect(view.rows[0]).toMatchObject({
          exercise_id: exA,
          exercise_version_id: verA2,
          prescription_type: "stretching",
        });
        expect(view.rows[0]?.params.hold_s).toBe(99);
        expect(view.rows[1]).toMatchObject({
          exercise_id: exB,
          exercise_version_id: verB2,
          prescription_type: "concentric",
        });
        expect(view.rows[1]?.params.reps).toBe(8);
        expect(view.rows[2]).toMatchObject({
          exercise_id: exC,
          exercise_version_id: verC2,
          prescription_type: "stretching",
        });
        expect(view.rows[2]?.params.hold_s).toBe(88);
      };

      const communityRowIds = [id("tri-prog-r1"), id("tri-prog-r2"), id("tri-prog-r3")];
      const copyRowIds = [id("tri-copy-r1"), id("tri-copy-r2"), id("tri-copy-r3")];
      const community = await service.createProgramFromRoutine(practitionerB, {
        programId: id("prog-tri-community"),
        routineId: id("tri-routine"),
        source: "community",
        rowIds: communityRowIds,
      });
      expectCommunityRows(community.program, communityRowIds);

      const fromCopy = await service.createProgramFromRoutine(practitionerB, {
        programId: id("prog-tri-my-copy"),
        routineId: id("tri-routine"),
        source: "my_copy",
        rowIds: copyRowIds,
      });
      expectMyCopyRows(fromCopy.program, copyRowIds);
    } finally {
      storage.close();
    }
  });

  it("finds PRG-PRG7 when listPrograms search query is PRG7", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const programs = new ProgramsRepository(storage);
      const service = new ProgramBuilderService(storage);
      await programs.create({
        id: id("prog-prg7-search"),
        createdBy: practitionerA,
        createdAt: TS,
        code: "PRG-PRG7",
        name: "Unrelated program title",
      });
      const result = await service.listPrograms(practitionerA, {
        searchQuery: "PRG7",
      });
      expect(result.items.map((item) => item.program_id)).toEqual([
        id("prog-prg7-search"),
      ]);
      expect(result.matched_code).toBe("PRG-PRG7");
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService program from routine ownership (practitioners A and B)", () => {
  it("returns program_not_found when B reads A program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const serviceA = new ProgramBuilderService(storage);
      const serviceB = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "owned-routine",
        draftVersion: "owned-rv-draft",
        row: "owned-rvr",
        name: "Owned routine",
      });
      await serviceA.createProgramFromRoutine(practitionerA, {
        programId: id("prog-owned-a"),
        routineId: id("owned-routine"),
        source: "community",
        rowIds: [id("owned-row-a")],
      });
      await expect(
        serviceB.getProgram(practitionerB, id("prog-owned-a")),
      ).rejects.toMatchObject({ code: "program_not_found" });
    } finally {
      storage.close();
    }
  });
});
