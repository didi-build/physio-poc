import { describe, expect, it } from "vitest";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
} from "../src/services/programs/program-builder-service.js";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";
import {
  PractitionerRoutinesRepository,
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
};

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
  return versions.publishDraft({
    routineId: id(seeds.routine),
    authorId: author,
    publishedAt: TS,
    name: seeds.name,
  });
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

describe("ProgramBuilderService program from routine (DIDI-1019)", () => {
  it("copies community rows with pinned doses and prefilled routine name", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const author = practitionerA;
      await publishRoutine(storage, author, {
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

  it("rejects draft-only routines and hides other practitioners drafts as program_not_found", async () => {
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
      await expect(
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-draft"),
          routineId: id("draft-only"),
          source: "community",
          rowIds: [],
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      await expect(
        service.createProgramFromRoutine(practitionerB, {
          programId: id("prog-hidden"),
          routineId: id("draft-only"),
          source: "community",
          rowIds: [],
        }),
      ).rejects.toMatchObject({ code: "program_not_found" });
      await expect(
        service.createProgramFromRoutine(practitionerA, {
          programId: id("prog-missing"),
          routineId: id("missing-routine"),
          source: "community",
          rowIds: [],
        }),
      ).rejects.toMatchObject({ code: "program_not_found" });
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
      const created = await service.createProgramFromRoutine(practitionerA, {
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
      expect(created.program.routine_origin?.used_as).toBe("used_as_is");
    } finally {
      storage.close();
    }
  });

  it("filters programs by origin and searches by routine name", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "search-routine",
        draftVersion: "search-rv-draft",
        row: "search-rvr",
        name: "Mobility alpha unique",
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
      const fromRoutine = await service.listPrograms(practitionerA, {
        originFilter: "from_routine",
      });
      expect(fromRoutine.items.map((item) => item.program_id)).toEqual([
        id("prog-from-routine"),
      ]);
      const fromScratch = await service.listPrograms(practitionerA, {
        originFilter: "from_scratch",
      });
      expect(
        fromScratch.items.some((item) => item.program_id === id("prog-scratch")),
      ).toBe(true);
      expect(
        fromScratch.items.some((item) => item.program_id === id("prog-from-routine")),
      ).toBe(false);
      const byRoutineName = await service.listPrograms(practitionerA, {
        searchQuery: "Mobility alpha",
      });
      expect(byRoutineName.items.map((item) => item.program_id)).toContain(
        id("prog-from-routine"),
      );
    } finally {
      storage.close();
    }
  });

  it("reports sent program count and codes for a routine", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const programs = new ProgramsRepository(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "sent-routine",
        draftVersion: "sent-rv-draft",
        row: "sent-rvr",
        name: "Sent stats routine",
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-sent-a"),
        routineId: id("sent-routine"),
        source: "community",
        rowIds: [id("sent-row-a")],
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-sent-b"),
        routineId: id("sent-routine"),
        source: "community",
        rowIds: [id("sent-row-b")],
      });
      const recordA = await programs.findById(id("prog-sent-a"));
      await programs.publish(id("prog-sent-a"), TS);
      const stats = await service.getRoutineSentProgramStats(
        practitionerA,
        id("sent-routine"),
      );
      expect(stats.sent_count).toBe(1);
      expect(stats.codes).toEqual([recordA!.code]);
    } finally {
      storage.close();
    }
  });

  it("returns program_not_found for another practitioner's routine stats lookup on a hidden draft", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const routines = new RoutinesRepository(storage);
      await routines.createDraft({
        id: id("stats-draft"),
        draftVersionId: id("stats-draft-ver"),
        createdBy: practitionerA,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await expect(
        service.getRoutineSentProgramStats(practitionerB, id("stats-draft")),
      ).rejects.toMatchObject({ code: "program_not_found" });
    } finally {
      storage.close();
    }
  });

  it.each([
    [
      "updateProgramName",
      async (
        service: ProgramBuilderService,
        practitionerId: string,
        programId: string,
      ) => {
        await service.updateProgramName(practitionerId, programId, "Renamed title");
      },
    ],
    [
      "addExerciseRow",
      async (
        service: ProgramBuilderService,
        practitionerId: string,
        programId: string,
      ) => {
        await service.addExerciseRow(practitionerId, programId, {
          rowId: id("tweak-add-row"),
          exerciseId: FIXTURE_EXERCISE_ID,
        });
      },
    ],
    [
      "updateRow dose",
      async (
        service: ProgramBuilderService,
        practitionerId: string,
        programId: string,
      ) => {
        const view = await service.getProgram(practitionerId, programId);
        const rowId = view.rows[0]!.id;
        await service.updateRow(practitionerId, programId, rowId, {
          params: { hold_s: 5 },
        });
      },
    ],
    [
      "updateRow note",
      async (
        service: ProgramBuilderService,
        practitionerId: string,
        programId: string,
      ) => {
        const view = await service.getProgram(practitionerId, programId);
        const rowId = view.rows[0]!.id;
        await service.updateRow(practitionerId, programId, rowId, {
          note: "Note tweak",
        });
      },
    ],
    [
      "duplicateRow",
      async (
        service: ProgramBuilderService,
        practitionerId: string,
        programId: string,
      ) => {
        const view = await service.getProgram(practitionerId, programId);
        const rowId = view.rows[0]!.id;
        await service.duplicateRow(practitionerId, programId, {
          sourceRowId: rowId,
          newRowId: id("tweak-dup-row"),
        });
      },
    ],
    [
      "removeRow",
      async (
        service: ProgramBuilderService,
        practitionerId: string,
        programId: string,
      ) => {
        await service.addExerciseRow(practitionerId, programId, {
          rowId: id("tweak-remove-extra"),
          exerciseId: FIXTURE_EXERCISE_ID,
        });
        const refreshed = await service.getProgram(practitionerId, programId);
        await service.removeRow(practitionerId, programId, refreshed.rows[1]!.id);
      },
    ],
    [
      "reorderRows",
      async (
        service: ProgramBuilderService,
        practitionerId: string,
        programId: string,
      ) => {
        await service.addExerciseRow(practitionerId, programId, {
          rowId: id("tweak-reorder-extra"),
          exerciseId: FIXTURE_EXERCISE_ID,
        });
        const view = await service.getProgram(practitionerId, programId);
        await service.reorderRows(practitionerId, programId, [
          view.rows[1]!.id,
          view.rows[0]!.id,
        ]);
      },
    ],
  ])(
    "%s marks routine origin as tweaked after the first edit",
    async (_label, edit) => {
      const storage = await openMigratedDatabase();
      try {
        const { practitionerA } = await seedTwoPractitioners(storage);
        const service = new ProgramBuilderService(storage);
        await publishRoutine(storage, practitionerA, {
          routine: `tweak-${_label}`,
          draftVersion: `tweak-${_label}-draft`,
          row: `tweak-${_label}-row`,
          name: `Tweak ${_label}`,
        });
        const programId = id(`prog-tweak-${_label}`);
        await service.createProgramFromRoutine(practitionerA, {
          programId,
          routineId: id(`tweak-${_label}`),
          source: "community",
          rowIds: [id(`prog-tweak-row-${_label}`)],
        });
        await edit(service, practitionerA, programId);
        const view = await service.getProgram(practitionerA, programId);
        expect(view.routine_origin?.used_as).toBe("tweaked");
      } finally {
        storage.close();
      }
    },
  );

  it("applyLibraryUpdateToRow marks routine origin as tweaked", async () => {
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
      const version2Id = id("ver-lib-2");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: version2Id,
          version_number: 2,
          status: "approved",
          approved_by: practitionerA,
          approved_at: TS,
          title: "Heel slide v2",
        }),
      );
      const view = await service.getProgram(practitionerA, programId);
      await service.applyLibraryUpdateToRow(practitionerA, programId, view.rows[0]!.id);
      const after = await service.getProgram(practitionerA, programId);
      expect(after.routine_origin?.used_as).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("updateRow prescription type marks routine origin as tweaked", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const strengtheningId = id("ex-strength-tweak");
      const strengtheningVersion = id("ver-strength-tweak");
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
          title: "Bridge",
        }),
      );
      await publishRoutine(storage, practitionerA, {
        routine: "type-tweak-routine",
        draftVersion: "type-tweak-draft",
        row: "type-tweak-rvr",
        name: "Type tweak routine",
      });
      const programId = id("prog-type-tweak");
      await service.createProgramFromRoutine(practitionerA, {
        programId,
        routineId: id("type-tweak-routine"),
        source: "community",
        rowIds: [id("prog-type-tweak-row")],
      });
      await service.addExerciseRow(practitionerA, programId, {
        rowId: id("prog-type-second-row"),
        exerciseId: strengtheningId,
        prescriptionType: "isometric",
      });
      const view = await service.getProgram(practitionerA, programId);
      const strengtheningRow = view.rows.find(
        (row) => row.exercise_id === strengtheningId,
      );
      await service.updateRow(practitionerA, programId, strengtheningRow!.id, {
        prescriptionType: "concentric",
        params: { reps: 10 },
      });
      const after = await service.getProgram(practitionerA, programId);
      expect(after.routine_origin?.used_as).toBe("tweaked");
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

  it("does not store patient-like strings in program names from routine prefill", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "name-routine",
        draftVersion: "name-rv-draft",
        row: "name-rvr",
        name: "Knee mobility starter",
      });
      const created = await service.useRoutineForPatient(practitionerA, {
        programId: id("prog-name"),
        routineId: id("name-routine"),
        source: "community",
        rowIds: [id("prog-name-row")],
      });
      expect(created.program.name).toBe("Knee mobility starter");
      expect(JSON.stringify(created.program)).not.toMatch(/patient/i);
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService program from routine ownership (practitioners A and B)", () => {
  it("returns program_not_found when B creates from A-only visible routine id mismatch", async () => {
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
      let err: ProgramBuilderServiceError | undefined;
      try {
        await serviceB.createProgramFromRoutine(practitionerB, {
          programId: id("prog-owned-b"),
          routineId: id("missing-for-b"),
          source: "community",
          rowIds: [id("owned-row-b")],
        });
      } catch (e) {
        err = e as ProgramBuilderServiceError;
      }
      expect(err?.code).toBe("program_not_found");
    } finally {
      storage.close();
    }
  });
});
