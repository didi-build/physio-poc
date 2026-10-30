import { describe, expect, it } from "vitest";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
  computeAutoSaveStatus,
  detectLibraryUpdate,
} from "../src/services/programs/program-builder-service.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";
import { PractitionerExercisesRepository } from "../src/storage/repositories/exercise-data.js";
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
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, 'approved', ?, ?, ?)`,
        [id("req-1"), "Pending squat", practitionerId, FIXTURE_EXERCISE_ID, TS, TS],
      );
      await service.createProgram(practitionerId, { programId: id("prog-ph") });
      await service.addPlaceholderRow(practitionerId, id("prog-ph"), {
        rowId: id("row-ph"),
        exerciseRequestId: id("req-1"),
      });
      const view = await service.getProgram(practitionerId, id("prog-ph"));
      expect(view.rows[0]?.kind).toBe("exercise");
      expect(view.rows[0]?.exercise_id).toBe(FIXTURE_EXERCISE_ID);
      expect(view.rows[0]?.exercise_version_id).toBe(FIXTURE_VERSION_ID);
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
      await service.restoreProgram(
        practitionerId,
        id("prog-del"),
        new Date("2026-06-01T12:00:00.000Z"),
      );
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
        service.restoreProgram(practitionerId, id("prog-old"), new Date(TS)),
      ).rejects.toMatchObject({
        code: "restore_window_expired",
      });
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
});
