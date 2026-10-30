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

async function assertCreateFromRoutineDidNotPersist(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  attemptedRowIds: string[],
) {
  const programs = new ProgramsRepository(storage);
  const rows = new ProgramRowsRepository(storage);
  expect(await programs.findById(id(programId))).toBeNull();
  for (const rowKey of attemptedRowIds) {
    const row = await rows.findById(id(rowKey));
    if (row) {
      expect(row.program_id).not.toBe(id(programId));
    }
  }
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
      await expect(
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-txn-fail"),
          routineId: id("txn-routine"),
          source: "community",
          rowIds: [id("txn-row-1"), id("txn-row-2")],
        }),
      ).rejects.toMatchObject({ code: "exercise_not_found" });
      const programs = new ProgramsRepository(storage);
      expect(await programs.findById(id("prog-txn-fail"))).toBeNull();
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
