import { describe, expect, it } from "vitest";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
  computeAutoSaveStatus,
  detectLibraryUpdate,
  linkApprovedPlaceholders,
} from "../src/services/programs/program-builder-service.js";
import {
  PROGRAM_RESTORE_AND_PURGE_WINDOW_MS,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import { validateProgramRowTextSnapshot } from "../src/domain/program-row-text.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";
import { PractitionerExercisesRepository } from "../src/storage/repositories/exercise-data.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedExercise,
  seedPractitioner,
  TS,
  versionInsertBindings,
  VERSION_INSERT_SQL,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const MS_DAY = 24 * 60 * 60 * 1000;

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

async function openService(now: () => string = () => TS) {
  const storage = await openMigratedDatabase();
  const service = new ProgramBuilderService(storage, now);
  return { storage, service };
}

function advancingClock(fromIso: string): () => string {
  let ms = Date.parse(fromIso);
  return () => {
    const value = new Date(ms).toISOString();
    ms += 1_000;
    return value;
  };
}

async function snapshotProgramDbState(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
) {
  const programs = new ProgramsRepository(storage);
  const rows = new ProgramRowsRepository(storage);
  return {
    program: await programs.findById(programId),
    rows: await rows.listForProgram(programId),
  };
}

function expectDbStateUnchanged(
  before: Awaited<ReturnType<typeof snapshotProgramDbState>>,
  after: Awaited<ReturnType<typeof snapshotProgramDbState>>,
): void {
  expect(after.program).toEqual(before.program);
  expect(after.rows).toEqual(before.rows);
}

async function markExerciseRequestApproved(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  requestId: string,
  exerciseId: string,
): Promise<void> {
  await storage.run(
    `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ?`,
    [exerciseId, TS, requestId],
  );
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

describe("ProgramBuilderService (integration, SQLite)", () => {
  it("creates a program with an assigned code and optional name", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      const created = await service.createProgram(practitionerId, {
        programId: id("prog-create"),
      });
      expect(created.program.code.startsWith("PRG-")).toBe(true);
      expect(created.program.name).toBeNull();
      expect(created.program.auto_save_status).toEqual({ kind: "not_published_yet" });
      await service.updateProgramName(practitionerId, id("prog-create"), "Knee plan");
      const view = await service.getProgram(practitionerId, id("prog-create"));
      expect(view.name).toBe("Knee plan");
    } finally {
      storage.close();
    }
  });

  it("adds rows with param precedence: exercise override, type defaults, global", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await typeDefaults.upsertPractitionerDefaults(
        id("td-p1"),
        practitionerId,
        "stretching",
        { hold_s: 20 },
      );
      const pe = new PractitionerExercisesRepository(storage);
      await pe.upsert({
        practitionerId,
        exerciseId: FIXTURE_EXERCISE_ID,
        savedAt: TS,
        paramOverrides: { stretching: { hold_s: 25 } },
      });
      await service.createProgram(practitionerId, { programId: id("prog-params") });
      const added = await service.addExerciseRow(practitionerId, id("prog-params"), {
        rowId: id("row-1"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      expect(added.program.rows[0]?.params.hold_s).toBe(25);
      expect(added.program.rows[0]?.params_source).toBe("exercise_override");

      await pe.upsert({
        practitionerId,
        exerciseId: FIXTURE_EXERCISE_ID,
        savedAt: TS,
        paramOverrides: {},
      });
      const added2 = await service.addExerciseRow(practitionerId, id("prog-params"), {
        rowId: id("row-2"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      expect(added2.program.rows[1]?.params.hold_s).toBe(20);
      expect(added2.program.rows[1]?.params_source).toBe("practitioner_defaults");

      await typeDefaults.deletePractitionerDefaults(practitionerId, "stretching");
      const added3 = await service.addExerciseRow(practitionerId, id("prog-params"), {
        rowId: id("row-3"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      expect(added3.program.rows[2]?.params.hold_s).toBeDefined();
      expect(added3.program.rows[2]?.params_source).toBe("global_defaults");
    } finally {
      storage.close();
    }
  });

  it("supports duplicate exercises and reordering edge positions", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await service.createProgram(practitionerId, { programId: id("prog-dup") });
      await service.addExerciseRow(practitionerId, id("prog-dup"), {
        rowId: id("row-a"),
        exerciseId: FIXTURE_EXERCISE_ID,
        params: { hold_s: 10 },
      });
      await service.addExerciseRow(practitionerId, id("prog-dup"), {
        rowId: id("row-b"),
        exerciseId: FIXTURE_EXERCISE_ID,
        params: { hold_s: 20 },
      });
      await service.duplicateRow(practitionerId, id("prog-dup"), {
        sourceRowId: id("row-a"),
        newRowId: id("row-copy"),
      });
      let view = await service.getProgram(practitionerId, id("prog-dup"));
      expect(view.rows.map((row) => row.id)).toEqual([
        id("row-a"),
        id("row-copy"),
        id("row-b"),
      ]);
      await service.reorderRows(practitionerId, id("prog-dup"), [
        id("row-b"),
        id("row-copy"),
        id("row-a"),
      ]);
      view = await service.getProgram(practitionerId, id("prog-dup"));
      expect(view.rows.map((row) => row.position)).toEqual([0, 1, 2]);
      await expect(
        service.reorderRows(practitionerId, id("prog-dup"), [id("row-a"), id("row-b")]),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });

  it("links placeholder rows when the exercise request is approved", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-1"),
        "Pending squat",
      );
      await service.createProgram(practitionerId, { programId: id("prog-ph") });
      await service.addPlaceholderRow(practitionerId, id("prog-ph"), {
        rowId: id("row-ph"),
        exerciseRequestId: id("req-1"),
        prescriptionType: "stretching",
        params: { hold_s: 45 },
        note: "Easy pace",
      });
      await markExerciseRequestApproved(storage, id("req-1"), FIXTURE_EXERCISE_ID);
      await linkApprovedPlaceholders(storage, id("req-1"), FIXTURE_VERSION_ID);
      const view = await service.getProgram(practitionerId, id("prog-ph"));
      expect(view.rows[0]?.kind).toBe("exercise");
      expect(view.rows[0]?.exercise_id).toBe(FIXTURE_EXERCISE_ID);
      expect(view.rows[0]?.exercise_version_id).toBe(FIXTURE_VERSION_ID);
      expect(view.rows[0]?.params.hold_s).toBe(45);
      expect(view.rows[0]?.note).toBe("Easy pace");
      expect(view.rows[0]?.text_snapshot.title).toBe("Heel slide");
    } finally {
      storage.close();
    }
  });

  it("linkApprovedPlaceholders rolls back with the caller transaction", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-tx"),
        "Pending squat",
      );
      await service.createProgram(practitionerId, { programId: id("prog-tx") });
      await service.addPlaceholderRow(practitionerId, id("prog-tx"), {
        rowId: id("row-tx"),
        exerciseRequestId: id("req-tx"),
        prescriptionType: "stretching",
      });
      await markExerciseRequestApproved(storage, id("req-tx"), FIXTURE_EXERCISE_ID);
      const before = await snapshotProgramDbState(storage, id("prog-tx"));
      await storage.run("BEGIN");
      await linkApprovedPlaceholders(storage, id("req-tx"), FIXTURE_VERSION_ID);
      await storage.run("ROLLBACK");
      const after = await snapshotProgramDbState(storage, id("prog-tx"));
      expectDbStateUnchanged(before, after);
    } finally {
      storage.close();
    }
  });

  it("linkApprovedPlaceholders is idempotent", async () => {
    const clock = advancingClock("2026-03-01T10:00:00.000Z");
    const { storage, service } = await openService(clock);
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-idem"),
        "Pending squat",
      );
      await service.createProgram(practitionerId, { programId: id("prog-idem") });
      await service.addPlaceholderRow(practitionerId, id("prog-idem"), {
        rowId: id("row-idem"),
        exerciseRequestId: id("req-idem"),
        prescriptionType: "stretching",
      });
      await markExerciseRequestApproved(storage, id("req-idem"), FIXTURE_EXERCISE_ID);
      await linkApprovedPlaceholders(
        storage,
        id("req-idem"),
        FIXTURE_VERSION_ID,
        clock,
      );
      const afterFirst = await snapshotProgramDbState(storage, id("prog-idem"));
      await linkApprovedPlaceholders(
        storage,
        id("req-idem"),
        FIXTURE_VERSION_ID,
        clock,
      );
      const afterSecond = await snapshotProgramDbState(storage, id("prog-idem"));
      expectDbStateUnchanged(afterFirst, afterSecond);
    } finally {
      storage.close();
    }
  });

  it("linkApprovedPlaceholders marks a published program as unpublished changes", async () => {
    const clock = advancingClock("2026-04-01T12:00:00.000Z");
    const { storage, service } = await openService(clock);
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-pub"),
        "Pending squat",
      );
      await service.createProgram(practitionerId, {
        programId: id("prog-pub-ph"),
        name: "Published with placeholder",
      });
      await service.addPlaceholderRow(practitionerId, id("prog-pub-ph"), {
        rowId: id("row-pub-ph"),
        exerciseRequestId: id("req-pub"),
        prescriptionType: "stretching",
      });
      await markExerciseRequestApproved(storage, id("req-pub"), FIXTURE_EXERCISE_ID);
      await programs.publish(id("prog-pub-ph"), TS);
      await linkApprovedPlaceholders(storage, id("req-pub"), FIXTURE_VERSION_ID, clock);
      const view = await service.getProgram(practitionerId, id("prog-pub-ph"));
      expect(view.auto_save_status).toEqual({ kind: "unpublished_changes" });
      const record = await programs.findById(id("prog-pub-ph"));
      expect(record?.published_at).toBe(TS);
    } finally {
      storage.close();
    }
  });

  it("detects library updates and supports update or keep without changing pinned version on keep", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await service.createProgram(practitionerId, { programId: id("prog-lib") });
      await service.addExerciseRow(practitionerId, id("prog-lib"), {
        rowId: id("row-lib"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const version2Id = id("ver-2");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: version2Id,
          version_number: 2,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
          title: "Heel slide v2",
        }),
      );
      let view = await service.getProgram(practitionerId, id("prog-lib"));
      expect(view.library_updates_to_review).toBe(1);
      expect(view.rows[0]?.library_update?.latest_version_number).toBe(2);
      const kept = await service.keepLibraryUpdateForRow(
        practitionerId,
        id("prog-lib"),
        id("row-lib"),
      );
      expect(kept.program.library_updates_to_review).toBe(0);
      expect(kept.program.rows[0]?.exercise_version_id).toBe(FIXTURE_VERSION_ID);
      view = await service.getProgram(practitionerId, id("prog-lib"));
      expect(view.rows[0]?.library_update).toBeNull();
      const updated = await service.applyLibraryUpdateToRow(
        practitionerId,
        id("prog-lib"),
        id("row-lib"),
      );
      expect(updated.program.rows[0]?.exercise_version_id).toBe(version2Id);
      expect(updated.program.rows[0]?.params.hold_s).toBe(30);
      expect(updated.program.rows[0]?.text_snapshot.title).toBe("Heel slide v2");
    } finally {
      storage.close();
    }
  });

  it("searches programs by name or code with or without PRG prefix", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-search"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Balance week 2",
        code: "PRG-SRCH",
      });
      const byName = await service.listPrograms(practitionerId, {
        searchQuery: "balance",
      });
      expect(byName.items.map((item) => item.program_id)).toContain(id("prog-search"));
      const byCode = await service.listPrograms(practitionerId, {
        searchQuery: "SRCH",
      });
      expect(byCode.matched_code).toBe("PRG-SRCH");
      expect(byCode.items).toHaveLength(1);
      const byPrefix = await service.listPrograms(practitionerId, {
        searchQuery: "PRG-SRCH",
      });
      expect(byPrefix.items[0]?.code).toBe("PRG-SRCH");
    } finally {
      storage.close();
    }
  });

  it("deletes and restores within 30 days, closes share links, and keeps links closed after restore", async () => {
    const { storage, service } = await openService(() => "2026-06-01T12:00:00.000Z");
    try {
      const practitionerId = await seedPractitioner(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-del"),
        name: "Temp plan",
      });
      const links = new ShareLinksRepository(storage);
      await links.createOpenLink({
        id: id("link-1"),
        programId: id("prog-del"),
        createdAt: TS,
        expiresAt: null,
      });
      await service.deleteProgram(practitionerId, id("prog-del"));
      expect(await links.findOpenByProgramId(id("prog-del"))).toBeNull();
      const deleted = await service.getProgram(practitionerId, id("prog-del"));
      expect(deleted.deleted_at).not.toBeNull();
      expect(deleted.open_share_link).toBe(false);
      await service.restoreProgram(practitionerId, id("prog-del"));
      const restored = await service.getProgram(practitionerId, id("prog-del"));
      expect(restored.deleted_at).toBeNull();
      expect(restored.open_share_link).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("rejects restore after the 30 day boundary", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-old"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      const deletedAt = new Date(Date.parse(TS) - 31 * MS_DAY).toISOString();
      await programs.softDelete(id("prog-old"), deletedAt);
      await expect(
        service.restoreProgram(practitionerId, id("prog-old")),
      ).rejects.toMatchObject({
        code: "restore_window_expired",
      });
    } finally {
      storage.close();
    }
  });

  it("restores at exactly 30 days and rejects 30 days plus 1 ms", async () => {
    const restoreNow = "2026-06-15T12:00:00.000Z";
    const { storage, service } = await openService(() => restoreNow);
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-edge"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      const now = new Date(restoreNow);
      const deletedAtExact = new Date(
        now.getTime() - PROGRAM_RESTORE_AND_PURGE_WINDOW_MS,
      ).toISOString();
      await programs.softDelete(id("prog-edge"), deletedAtExact);
      await expect(
        service.restoreProgram(practitionerId, id("prog-edge")),
      ).resolves.toBeDefined();
      await programs.softDelete(
        id("prog-edge"),
        new Date(now.getTime() - PROGRAM_RESTORE_AND_PURGE_WINDOW_MS - 1).toISOString(),
      );
      await expect(
        service.restoreProgram(practitionerId, id("prog-edge")),
      ).rejects.toMatchObject({ code: "restore_window_expired" });
    } finally {
      storage.close();
    }
  });

  it("blocks cross-practitioner access with forbidden", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = await seedPractitioner(
        storage,
        id("practitioner-b"),
        "other@example.com",
      );
      await service.createProgram(practitionerA, { programId: id("prog-a") });
      await expect(
        service.getProgram(practitionerB, id("prog-a")),
      ).rejects.toMatchObject({
        code: "forbidden",
      });
      await expect(
        service.updateProgramName(practitionerB, id("prog-a"), "Stolen"),
      ).rejects.toMatchObject({ code: "forbidden" });
    } finally {
      storage.close();
    }
  });

  it("reports unpublished changes after publish when draft edits land", async () => {
    const { storage } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      const serviceLater = new ProgramBuilderService(
        storage,
        () => "2026-01-02T00:00:00.000Z",
      );
      await programs.create({
        id: id("prog-pub"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Published plan",
      });
      await rows.replaceRow({
        id: id("row-1"),
        programId: id("prog-pub"),
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      await programs.publish(id("prog-pub"), TS);
      const programRecord = await programs.findById(id("prog-pub"));
      expect(computeAutoSaveStatus(programRecord!).kind).toBe("published");
      await serviceLater.updateRow(practitionerId, id("prog-pub"), id("row-1"), {
        params: { hold_s: 40 },
      });
      const view = await serviceLater.getProgram(practitionerId, id("prog-pub"));
      expect(view.auto_save_status).toEqual({ kind: "unpublished_changes" });
    } finally {
      storage.close();
    }
  });
});

describe("detectLibraryUpdate (unit)", () => {
  it("returns null when dismissed version covers the latest library version", () => {
    const row = {
      id: id("row-1"),
      exercise_id: FIXTURE_EXERCISE_ID,
      exercise_version_id: FIXTURE_VERSION_ID,
    } as import("../src/storage/repositories/programs.js").ProgramRow;
    const pinned = {
      version_number: 1,
    } as import("../src/storage/repositories/exercise-library-read.js").LatestApprovedVersionRow;
    const latest = { version_number: 3 } as typeof pinned;
    const prompt = detectLibraryUpdate(row, pinned, latest, {
      title: "Heel slide",
      libraryUpdateDismissedVersionNumber: 3,
    });
    expect(prompt).toBeNull();
  });

  it("returns a prompt when latest exceeds pinned and is not dismissed", () => {
    const row = {
      id: id("row-2"),
      exercise_id: FIXTURE_EXERCISE_ID,
    } as import("../src/storage/repositories/programs.js").ProgramRow;
    const pinned = {
      version_number: 1,
    } as import("../src/storage/repositories/exercise-library-read.js").LatestApprovedVersionRow;
    const latest = { version_number: 2 } as typeof pinned;
    const prompt = detectLibraryUpdate(row, pinned, latest, { title: "Move" });
    expect(prompt?.latest_version_number).toBe(2);
    expect(prompt?.pinned_version_number).toBe(1);
  });
});

describe("ProgramBuilderService patient-detail guard", () => {
  it("rejects program names that fail patient-detail validation", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await service.createProgram(practitionerId, { programId: id("prog-pii") });
      await expect(
        service.updateProgramName(
          practitionerId,
          id("prog-pii"),
          "plan coach@example.com",
        ),
      ).rejects.toBeInstanceOf(ProgramBuilderServiceError);
    } finally {
      storage.close();
    }
  });

  it("maps FreeTextValidationError on createProgram name", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await expect(
        service.createProgram(practitionerId, {
          programId: id("prog-create-bad-name"),
          name: "plan coach@example.com",
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });

  it("maps FreeTextValidationError on addExerciseRow note", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await service.createProgram(practitionerId, { programId: id("prog-note") });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-note"), {
          rowId: id("row-note"),
          exerciseId: FIXTURE_EXERCISE_ID,
          note: "416-555-0100",
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService practitioner guard", () => {
  it("rejects a well-formed practitioner id that is not in the database", async () => {
    const { storage, service } = await openService();
    try {
      const unknownPractitionerId = id("practitioner-does-not-exist");
      await expect(
        service.createProgram(unknownPractitionerId, {
          programId: id("prog-no-practitioner"),
        }),
      ).rejects.toMatchObject({ code: "practitioner_not_found" });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService opaque id validation", () => {
  const badId = "not-a-valid-opaque-id";

  it.each([
    [
      "getProgram programId",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.getProgram(practitionerId, badId),
    ],
    [
      "updateProgramName programId",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.updateProgramName(practitionerId, badId, "Name"),
    ],
    [
      "addExerciseRow programId",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.addExerciseRow(practitionerId, badId, {
          rowId: id("row-bad"),
          exerciseId: FIXTURE_EXERCISE_ID,
        }),
    ],
    [
      "addExerciseRow exerciseId",
      async (s: ProgramBuilderService, practitionerId: string) => {
        await s.createProgram(practitionerId, { programId: id("prog-bad-ex") });
        return s.addExerciseRow(practitionerId, id("prog-bad-ex"), {
          rowId: id("row-bad-ex"),
          exerciseId: badId,
        });
      },
    ],
    [
      "addPlaceholderRow exerciseRequestId",
      async (s: ProgramBuilderService, practitionerId: string) => {
        await s.createProgram(practitionerId, { programId: id("prog-bad-ph") });
        return s.addPlaceholderRow(practitionerId, id("prog-bad-ph"), {
          rowId: id("row-bad-ph"),
          exerciseRequestId: badId,
          prescriptionType: "stretching",
        });
      },
    ],
    [
      "duplicateRow sourceRowId",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.duplicateRow(practitionerId, id("prog-missing"), {
          sourceRowId: badId,
          newRowId: id("row-dup-new"),
        }),
    ],
    [
      "removeRow rowId",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.removeRow(practitionerId, id("prog-missing"), badId),
    ],
    [
      "reorderRows orderedRowIds",
      async (s: ProgramBuilderService, practitionerId: string) => {
        await s.createProgram(practitionerId, { programId: id("prog-reorder-bad") });
        return s.reorderRows(practitionerId, id("prog-reorder-bad"), [badId]);
      },
    ],
    [
      "applyLibraryUpdateToRow rowId",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.applyLibraryUpdateToRow(practitionerId, id("prog-missing"), badId),
    ],
    [
      "keepLibraryUpdateForRow rowId",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.keepLibraryUpdateForRow(practitionerId, id("prog-missing"), badId),
    ],
    [
      "deleteProgram programId",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.deleteProgram(practitionerId, badId),
    ],
    [
      "restoreProgram programId",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.restoreProgram(practitionerId, badId),
    ],
  ])("%s rejects invalid_input", async (_name, invoke) => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await expect(invoke(service, practitionerId)).rejects.toMatchObject({
        code: "invalid_input",
      });
    } finally {
      storage.close();
    }
  });

  it("rejects invalid updateRow rowId", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await service.createProgram(practitionerId, { programId: id("prog-bad-row") });
      await service.addExerciseRow(practitionerId, id("prog-bad-row"), {
        rowId: id("row-good"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.updateRow(practitionerId, id("prog-bad-row"), badId, {
          params: { hold_s: 5 },
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });

  it("rejects invalid linkApprovedPlaceholders ids", async () => {
    const storage = await openMigratedDatabase();
    try {
      await expect(
        linkApprovedPlaceholders(storage, badId, FIXTURE_VERSION_ID),
      ).rejects.toMatchObject({ code: "invalid_input" });
      await expect(
        linkApprovedPlaceholders(storage, id("req-link"), badId),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService linkApprovedPlaceholders", () => {
  it("skips incompatible prescription types and returns the skipped count", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(storage, practitionerId, id("req-mix"), "Squat");
      await service.createProgram(practitionerId, { programId: id("prog-mix") });
      await service.addPlaceholderRow(practitionerId, id("prog-mix"), {
        rowId: id("row-mix-fit"),
        exerciseRequestId: id("req-mix"),
        prescriptionType: "stretching",
        note: "fits",
      });
      await service.addPlaceholderRow(practitionerId, id("prog-mix"), {
        rowId: id("row-mix-skip"),
        exerciseRequestId: id("req-mix"),
        prescriptionType: "isometric",
        note: "misfit",
      });
      const misfitBefore = await new ProgramRowsRepository(storage).findById(
        id("row-mix-skip"),
      );
      await markExerciseRequestApproved(storage, id("req-mix"), FIXTURE_EXERCISE_ID);
      const skipped = await linkApprovedPlaceholders(
        storage,
        id("req-mix"),
        FIXTURE_VERSION_ID,
      );
      expect(skipped).toBe(1);
      const view = await service.getProgram(practitionerId, id("prog-mix"));
      expect(view.rows.find((row) => row.id === id("row-mix-fit"))?.kind).toBe(
        "exercise",
      );
      const misfitAfter = await new ProgramRowsRepository(storage).findById(
        id("row-mix-skip"),
      );
      expect(misfitAfter?.exercise_request_id).toBe(id("req-mix"));
      expect(misfitAfter?.prescription_type).toBe("isometric");
      expect(misfitAfter?.note).toBe("misfit");
      expect(misfitAfter?.params_json).toBe(misfitBefore?.params_json);
    } finally {
      storage.close();
    }
  });

  it("keeps prescription_type on rows that link", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(storage, practitionerId, id("req-type"), "Move");
      await service.createProgram(practitionerId, { programId: id("prog-type") });
      await service.addPlaceholderRow(practitionerId, id("prog-type"), {
        rowId: id("row-type"),
        exerciseRequestId: id("req-type"),
        prescriptionType: "stretching",
      });
      await markExerciseRequestApproved(storage, id("req-type"), FIXTURE_EXERCISE_ID);
      await linkApprovedPlaceholders(storage, id("req-type"), FIXTURE_VERSION_ID);
      const row = await new ProgramRowsRepository(storage).findById(id("row-type"));
      expect(row?.prescription_type).toBe("stretching");
    } finally {
      storage.close();
    }
  });

  it("rejects approvedVersionId when it belongs to a different exercise", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const otherExerciseId = id("ex-other");
      await seedExercise(storage, practitionerId, otherExerciseId);
      const otherVersionId = id("ver-other");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: otherVersionId,
          exercise_id: otherExerciseId,
          version_number: 1,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
        }),
      );
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-wrong-ver"),
        "Move",
      );
      await service.createProgram(practitionerId, { programId: id("prog-wrong-ver") });
      await service.addPlaceholderRow(practitionerId, id("prog-wrong-ver"), {
        rowId: id("row-wrong-ver"),
        exerciseRequestId: id("req-wrong-ver"),
        prescriptionType: "stretching",
      });
      await markExerciseRequestApproved(
        storage,
        id("req-wrong-ver"),
        FIXTURE_EXERCISE_ID,
      );
      const before = await snapshotProgramDbState(storage, id("prog-wrong-ver"));
      await expect(
        linkApprovedPlaceholders(storage, id("req-wrong-ver"), otherVersionId),
      ).rejects.toMatchObject({ code: "invalid_input" });
      const after = await snapshotProgramDbState(storage, id("prog-wrong-ver"));
      expectDbStateUnchanged(before, after);
    } finally {
      storage.close();
    }
  });

  it("rolls back linked rows when the caller transaction rolls back after a partial link", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-partial"),
        "Squat",
      );
      await service.createProgram(practitionerId, { programId: id("prog-partial") });
      await service.addPlaceholderRow(practitionerId, id("prog-partial"), {
        rowId: id("row-partial-fit"),
        exerciseRequestId: id("req-partial"),
        prescriptionType: "stretching",
      });
      await service.addPlaceholderRow(practitionerId, id("prog-partial"), {
        rowId: id("row-partial-skip"),
        exerciseRequestId: id("req-partial"),
        prescriptionType: "isometric",
      });
      await markExerciseRequestApproved(
        storage,
        id("req-partial"),
        FIXTURE_EXERCISE_ID,
      );
      const before = await snapshotProgramDbState(storage, id("prog-partial"));
      await storage.run("BEGIN");
      const skipped = await linkApprovedPlaceholders(
        storage,
        id("req-partial"),
        FIXTURE_VERSION_ID,
      );
      expect(skipped).toBe(1);
      await storage.run("ROLLBACK");
      const after = await snapshotProgramDbState(storage, id("prog-partial"));
      expectDbStateUnchanged(before, after);
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService placeholder rows", () => {
  it("accepts the caller's own drafting exercise request", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: id("req-drafting"),
        requestedName: "Draft move",
        requestedBy: practitionerId,
        status: "drafting",
        createdAt: TS,
        updatedAt: TS,
      });
      await service.createProgram(practitionerId, { programId: id("prog-drafting") });
      const result = await service.addPlaceholderRow(
        practitionerId,
        id("prog-drafting"),
        {
          rowId: id("row-drafting"),
          exerciseRequestId: id("req-drafting"),
          prescriptionType: "stretching",
        },
      );
      expect(result.program.rows[0]?.kind).toBe("placeholder");
      expect(result.program.rows[0]?.exercise_request_id).toBe(id("req-drafting"));
    } finally {
      storage.close();
    }
  });

  it("requires prescriptionType for placeholder rows with a specific error", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: id("req-open"),
        requestedName: "New move",
        requestedBy: practitionerId,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      await service.createProgram(practitionerId, { programId: id("prog-ph-req") });
      await expect(
        service.addPlaceholderRow(practitionerId, id("prog-ph-req"), {
          rowId: id("row-ph-req"),
          exerciseRequestId: id("req-open"),
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "prescriptionType is required for placeholder rows",
      });
    } finally {
      storage.close();
    }
  });

  it("rejects an invalid prescriptionType literal on placeholder rows", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-bad-type"),
        "Move",
      );
      await service.createProgram(practitionerId, { programId: id("prog-bad-type") });
      await expect(
        service.addPlaceholderRow(practitionerId, id("prog-bad-type"), {
          rowId: id("row-bad-type"),
          exerciseRequestId: id("req-bad-type"),
          prescriptionType:
            "not-a-type" as import("../src/domain/exercise-types.js").PrescriptionType,
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message:
          "prescriptionType must be one of: stretching, isometric, concentric, eccentric",
      });
    } finally {
      storage.close();
    }
  });

  it("uses practitioner My type defaults for placeholder rows", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await typeDefaults.upsertPractitionerDefaults(
        id("td-ph"),
        practitionerId,
        "stretching",
        { hold_s: 77 },
      );
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-defaults"),
        "Move",
      );
      await service.createProgram(practitionerId, { programId: id("prog-defaults") });
      const added = await service.addPlaceholderRow(
        practitionerId,
        id("prog-defaults"),
        {
          rowId: id("row-defaults"),
          exerciseRequestId: id("req-defaults"),
          prescriptionType: "stretching",
        },
      );
      expect(added.program.rows[0]?.params.hold_s).toBe(77);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await markExerciseRequestApproved(
        storage,
        id("req-defaults"),
        FIXTURE_EXERCISE_ID,
      );
      await linkApprovedPlaceholders(storage, id("req-defaults"), FIXTURE_VERSION_ID);
      const linked = await service.getProgram(practitionerId, id("prog-defaults"));
      expect(linked.rows[0]?.params.hold_s).toBe(77);
    } finally {
      storage.close();
    }
  });

  it("treats another practitioner's open exercise request like a missing request", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = await seedPractitioner(
        storage,
        id("practitioner-b"),
        "other@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: id("req-a-open"),
        requestedName: "Secret draft",
        requestedBy: practitionerA,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      await service.createProgram(practitionerB, { programId: id("prog-b") });
      let missingError: ProgramBuilderServiceError | undefined;
      try {
        await service.addPlaceholderRow(practitionerB, id("prog-b"), {
          rowId: id("row-missing"),
          exerciseRequestId: id("req-missing"),
          prescriptionType: "stretching",
        });
      } catch (err) {
        missingError = err as ProgramBuilderServiceError;
      }
      let stolenError: ProgramBuilderServiceError | undefined;
      try {
        await service.addPlaceholderRow(practitionerB, id("prog-b"), {
          rowId: id("row-stolen"),
          exerciseRequestId: id("req-a-open"),
          prescriptionType: "stretching",
        });
      } catch (err) {
        stolenError = err as ProgramBuilderServiceError;
      }
      expect(missingError?.code).toBe("exercise_request_not_found");
      expect(stolenError?.code).toBe("exercise_request_not_found");
      expect(stolenError?.message).toBe(missingError?.message);
    } finally {
      storage.close();
    }
  });

  it.each([
    ["approved", "approved"],
    ["withdrawn", "withdrawn"],
  ] as const)(
    "rejects attaching a placeholder to a %s exercise request",
    async (_label, status) => {
      const { storage, service } = await openService();
      try {
        const practitionerId = await seedPractitioner(storage);
        if (status === "approved") {
          await seedApprovedExerciseForBuilder(storage, practitionerId);
        }
        const requests = new ExerciseRequestsRepository(storage);
        await requests.insert({
          id: id(`req-${status}`),
          requestedName: "Done request",
          requestedBy: practitionerId,
          status,
          exerciseId: status === "approved" ? FIXTURE_EXERCISE_ID : null,
          createdAt: TS,
          updatedAt: TS,
        });
        await service.createProgram(practitionerId, {
          programId: id(`prog-${status}`),
        });
        await expect(
          service.addPlaceholderRow(practitionerId, id(`prog-${status}`), {
            rowId: id(`row-${status}`),
            exerciseRequestId: id(`req-${status}`),
            prescriptionType: "stretching",
          }),
        ).rejects.toMatchObject({ code: "invalid_input" });
      } finally {
        storage.close();
      }
    },
  );
});

describe("ProgramBuilderService getProgram is read-only", () => {
  it("does not resolve placeholders or change draft_updated_at on getProgram", async () => {
    const clock = advancingClock("2026-05-01T08:00:00.000Z");
    const { storage, service } = await openService(clock);
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-ro"),
        "Pending squat",
      );
      await programs.create({
        id: id("prog-ro"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Read only plan",
      });
      await service.addPlaceholderRow(practitionerId, id("prog-ro"), {
        rowId: id("row-ro"),
        exerciseRequestId: id("req-ro"),
        prescriptionType: "stretching",
      });
      await markExerciseRequestApproved(storage, id("req-ro"), FIXTURE_EXERCISE_ID);
      await programs.publish(id("prog-ro"), TS);
      const before = await snapshotProgramDbState(storage, id("prog-ro"));
      expect(before.rows[0]?.exercise_request_id).toBe(id("req-ro"));
      const view = await service.getProgram(practitionerId, id("prog-ro"));
      const after = await snapshotProgramDbState(storage, id("prog-ro"));
      expect(view.auto_save_status.kind).toBe("published");
      expectDbStateUnchanged(before, after);
    } finally {
      storage.close();
    }
  });
});

describe("validateProgramRowTextSnapshot libraryUpdateDismissedVersionNumber", () => {
  it.each([
    ["zero", 0],
    ["negative", -1],
    ["non-integer", 1.5],
  ])("rejects %s", (_label, value) => {
    expect(() =>
      validateProgramRowTextSnapshot({
        title: "Heel slide",
        libraryUpdateDismissedVersionNumber: value as number,
      }),
    ).toThrow();
  });

  it("rejects non-numeric dismissed version in stored JSON via getProgram", async () => {
    const { storage, service } = await openService();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await service.createProgram(practitionerId, { programId: id("prog-bad-json") });
      await service.addExerciseRow(practitionerId, id("prog-bad-json"), {
        rowId: id("row-bad-json"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await storage.run(`UPDATE program_rows SET text_snapshot_json = ? WHERE id = ?`, [
        JSON.stringify({
          title: "Heel slide",
          libraryUpdateDismissedVersionNumber: "2",
        }),
        id("row-bad-json"),
      ]);
      await expect(
        service.getProgram(practitionerId, id("prog-bad-json")),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });
});

async function seedSharedProgramWithRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
) {
  const practitionerA = await seedPractitioner(storage);
  const practitionerB = await seedPractitioner(
    storage,
    id("practitioner-b"),
    "other@example.com",
  );
  await seedApprovedExerciseForBuilder(storage, practitionerA);
  const serviceA = new ProgramBuilderService(storage);
  await serviceA.createProgram(practitionerA, { programId: id("prog-shared") });
  await serviceA.addExerciseRow(practitionerA, id("prog-shared"), {
    rowId: id("row-shared"),
    exerciseId: FIXTURE_EXERCISE_ID,
  });
  return { practitionerA, practitionerB, serviceA };
}

describe("ProgramBuilderService cross-practitioner forbidden", () => {
  it.each([
    [
      "getProgram",
      (s: ProgramBuilderService, b: string) => s.getProgram(b, id("prog-shared")),
    ],
    [
      "updateProgramName",
      (s: ProgramBuilderService, b: string) =>
        s.updateProgramName(b, id("prog-shared"), "Taken"),
    ],
    [
      "addExerciseRow",
      (s: ProgramBuilderService, b: string) =>
        s.addExerciseRow(b, id("prog-shared"), {
          rowId: id("row-new"),
          exerciseId: FIXTURE_EXERCISE_ID,
        }),
    ],
    [
      "addPlaceholderRow",
      (s: ProgramBuilderService, b: string) =>
        s.addPlaceholderRow(b, id("prog-shared"), {
          rowId: id("row-ph-b"),
          exerciseRequestId: id("req-b"),
          prescriptionType: "stretching",
        }),
    ],
    [
      "updateRow",
      (s: ProgramBuilderService, b: string) =>
        s.updateRow(b, id("prog-shared"), id("row-shared"), { params: { hold_s: 5 } }),
    ],
    [
      "duplicateRow",
      (s: ProgramBuilderService, b: string) =>
        s.duplicateRow(b, id("prog-shared"), {
          sourceRowId: id("row-shared"),
          newRowId: id("row-dup-b"),
        }),
    ],
    [
      "removeRow",
      (s: ProgramBuilderService, b: string) =>
        s.removeRow(b, id("prog-shared"), id("row-shared")),
    ],
    [
      "reorderRows",
      (s: ProgramBuilderService, b: string) =>
        s.reorderRows(b, id("prog-shared"), [id("row-shared")]),
    ],
    [
      "applyLibraryUpdateToRow",
      (s: ProgramBuilderService, b: string) =>
        s.applyLibraryUpdateToRow(b, id("prog-shared"), id("row-shared")),
    ],
    [
      "keepLibraryUpdateForRow",
      (s: ProgramBuilderService, b: string) =>
        s.keepLibraryUpdateForRow(b, id("prog-shared"), id("row-shared")),
    ],
    [
      "deleteProgram",
      (s: ProgramBuilderService, b: string) => s.deleteProgram(b, id("prog-shared")),
    ],
  ])(
    "%s returns forbidden for another practitioner's program",
    async (_name, invoke) => {
      const storage = await openMigratedDatabase();
      try {
        const { practitionerB } = await seedSharedProgramWithRow(storage);
        const serviceB = new ProgramBuilderService(storage);
        const before = await snapshotProgramDbState(storage, id("prog-shared"));
        await expect(invoke(serviceB, practitionerB)).rejects.toMatchObject({
          code: "forbidden",
        });
        const after = await snapshotProgramDbState(storage, id("prog-shared"));
        expectDbStateUnchanged(before, after);
      } finally {
        storage.close();
      }
    },
  );

  it("restoreProgram returns forbidden for another practitioner's deleted program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedSharedProgramWithRow(storage);
      const serviceA = new ProgramBuilderService(storage);
      await serviceA.deleteProgram(practitionerA, id("prog-shared"));
      const serviceB = new ProgramBuilderService(storage);
      const before = await snapshotProgramDbState(storage, id("prog-shared"));
      await expect(
        serviceB.restoreProgram(practitionerB, id("prog-shared")),
      ).rejects.toMatchObject({ code: "forbidden" });
      const after = await snapshotProgramDbState(storage, id("prog-shared"));
      expectDbStateUnchanged(before, after);
    } finally {
      storage.close();
    }
  });
});
