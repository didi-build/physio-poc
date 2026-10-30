import { afterEach, describe, expect, it, vi } from "vitest";
import { PATIENT_DETAIL_REJECTION_MESSAGE } from "../src/mcp-connector/patient-detail-validator.js";
import { PRESCRIPTION_TYPES } from "../src/domain/exercise-types.js";
import {
  ProgramBuilderService,
  linkApprovedPlaceholders,
} from "../src/services/programs/program-builder-service.js";
import {
  PROGRAM_RESTORE_AND_PURGE_WINDOW_MS,
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const MS_DAY = 24 * 60 * 60 * 1000;
const BAD_OPAQUE_ID = "not-a-valid-opaque-id";
const PROGRAM_ID_OPAQUE_MESSAGE = "Program id must be a UUID v4 opaque id";
const ROW_ID_OPAQUE_MESSAGE = "Program row id must be a UUID v4 opaque id";
const EXERCISE_VERSION_ID_OPAQUE_MESSAGE =
  "Exercise version id must be a UUID v4 opaque id";
const HOLD_S_RANGE_MESSAGE = "hold_s must be between 1 and 120";
const LINK_VERSION_MISMATCH_MESSAGE =
  "approvedVersionId does not match the exercise request";
const ROW_NOTE_PATIENT_DETAIL_MESSAGE = `Row note: ${PATIENT_DETAIL_REJECTION_MESSAGE}`;
const FLAGGED_NOTE = "coach@example.com";

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

async function seedStrengtheningApprovedExercise(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  exerciseId: string,
  versionId: string,
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
      title: "Squat",
    }),
  );
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

/** Practitioner A owns a program row; practitioner B owns a separate program with its own row. */
async function seedRowIsolationFixture(
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
  const serviceB = new ProgramBuilderService(storage);
  await serviceA.createProgram(practitionerA, { programId: id("prog-a") });
  await serviceB.createProgram(practitionerB, { programId: id("prog-b") });
  await serviceA.addExerciseRow(practitionerA, id("prog-a"), {
    rowId: id("row-a"),
    exerciseId: FIXTURE_EXERCISE_ID,
  });
  await serviceB.addExerciseRow(practitionerB, id("prog-b"), {
    rowId: id("row-b"),
    exerciseId: FIXTURE_EXERCISE_ID,
  });
  return { practitionerA, practitionerB, serviceA, serviceB };
}

describe("ProgramBuilderService QA blocker 3 row isolation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      "updateRow",
      (s: ProgramBuilderService, b: string) =>
        s.updateRow(b, id("prog-b"), id("row-a"), { params: { hold_s: 1 } }),
    ],
    [
      "removeRow",
      (s: ProgramBuilderService, b: string) =>
        s.removeRow(b, id("prog-b"), id("row-a")),
    ],
    [
      "duplicateRow",
      (s: ProgramBuilderService, b: string) =>
        s.duplicateRow(b, id("prog-b"), {
          sourceRowId: id("row-a"),
          newRowId: id("row-copy-b"),
        }),
    ],
    [
      "applyLibraryUpdateToRow",
      (s: ProgramBuilderService, b: string) =>
        s.applyLibraryUpdateToRow(b, id("prog-b"), id("row-a")),
    ],
    [
      "keepLibraryUpdateForRow",
      (s: ProgramBuilderService, b: string) =>
        s.keepLibraryUpdateForRow(b, id("prog-b"), id("row-a")),
    ],
    [
      "reorderRows",
      (s: ProgramBuilderService, b: string) =>
        s.reorderRows(b, id("prog-b"), [id("row-a")]),
      "invalid_input" as const,
      "Reorder includes an unknown row id",
    ],
  ])(
    "%s rejects another practitioner's row id on B's program without changing A",
    async (
      _name,
      invoke,
      expectedCode?: "program_row_not_found" | "invalid_input",
      expectedMessage?: string,
    ) => {
      const code = expectedCode ?? "program_row_not_found";
      const storage = await openMigratedDatabase();
      try {
        const { practitionerB, serviceB } = await seedRowIsolationFixture(storage);
        const beforeA = await snapshotProgramDbState(storage, id("prog-a"));
        const beforeB = await snapshotProgramDbState(storage, id("prog-b"));
        await expect(invoke(serviceB, practitionerB)).rejects.toMatchObject({
          code,
          ...(expectedMessage ? { message: expectedMessage } : {}),
        });
        const afterA = await snapshotProgramDbState(storage, id("prog-a"));
        const afterB = await snapshotProgramDbState(storage, id("prog-b"));
        expectDbStateUnchanged(beforeA, afterA);
        expectDbStateUnchanged(beforeB, afterB);
      } finally {
        storage.close();
      }
    },
  );
});

describe("ProgramBuilderService list isolation", () => {
  it("listPrograms returns only programs created by the caller", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = await seedPractitioner(
        storage,
        id("practitioner-b"),
        "b@example.com",
      );
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-list-a"),
        createdBy: practitionerA,
        createdAt: TS,
        name: "A plan",
      });
      await programs.create({
        id: id("prog-list-b"),
        createdBy: practitionerB,
        createdAt: TS,
        name: "B plan",
      });
      const serviceA = new ProgramBuilderService(storage);
      const serviceB = new ProgramBuilderService(storage);
      const listA = await serviceA.listPrograms(practitionerA);
      const listB = await serviceB.listPrograms(practitionerB);
      expect(listA.items.map((item) => item.program_id)).toEqual([id("prog-list-a")]);
      expect(listB.items.map((item) => item.program_id)).toEqual([id("prog-list-b")]);
    } finally {
      storage.close();
    }
  });

  it("listPrograms excludes soft-deleted programs", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-active-list"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await programs.create({
        id: id("prog-deleted-list"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await programs.softDelete(id("prog-deleted-list"), TS);
      const service = new ProgramBuilderService(storage);
      const list = await service.listPrograms(practitionerId);
      expect(list.items.map((item) => item.program_id)).toEqual([
        id("prog-active-list"),
      ]);
    } finally {
      storage.close();
    }
  });

  it("listPrograms searchQuery filters by name", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-alpha"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Alpha rehab",
      });
      await programs.create({
        id: id("prog-beta"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Beta balance",
      });
      const service = new ProgramBuilderService(storage);
      const filtered = await service.listPrograms(practitionerId, {
        searchQuery: "alpha",
      });
      expect(filtered.items.map((item) => item.program_id)).toEqual([id("prog-alpha")]);
    } finally {
      storage.close();
    }
  });

  it("listRecentlyDeletedPrograms returns only the caller's deletions within 30 days", async () => {
    const now = "2026-07-01T12:00:00.000Z";
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = await seedPractitioner(
        storage,
        id("practitioner-b"),
        "b@example.com",
      );
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-del-a"),
        createdBy: practitionerA,
        createdAt: TS,
      });
      await programs.create({
        id: id("prog-del-b"),
        createdBy: practitionerB,
        createdAt: TS,
      });
      await programs.create({
        id: id("prog-del-old"),
        createdBy: practitionerA,
        createdAt: TS,
      });
      const recentDeletedAt = new Date(Date.parse(now) - 5 * MS_DAY).toISOString();
      const expiredDeletedAt = new Date(
        Date.parse(now) - PROGRAM_RESTORE_AND_PURGE_WINDOW_MS - MS_DAY,
      ).toISOString();
      await programs.softDelete(id("prog-del-a"), recentDeletedAt);
      await programs.softDelete(id("prog-del-b"), recentDeletedAt);
      await programs.softDelete(id("prog-del-old"), expiredDeletedAt);
      await programs.create({
        id: id("prog-del-nan"),
        createdBy: practitionerA,
        createdAt: TS,
      });
      await storage.run(`UPDATE programs SET deleted_at = ? WHERE id = ?`, [
        "not-a-valid-date",
        id("prog-del-nan"),
      ]);

      const serviceA = new ProgramBuilderService(storage, () => now);
      const serviceB = new ProgramBuilderService(storage, () => now);
      const listA = await serviceA.listRecentlyDeletedPrograms(practitionerA);
      const listB = await serviceB.listRecentlyDeletedPrograms(practitionerB);
      expect(listA.map((item) => item.program_id)).toEqual([id("prog-del-a")]);
      expect(listB.map((item) => item.program_id)).toEqual([id("prog-del-b")]);
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService requireOwnedProgram and practitioner guards", () => {
  it("returns program_not_found for a missing program id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new ProgramBuilderService(storage);
      await expect(
        service.getProgram(practitionerId, id("prog-missing")),
      ).rejects.toMatchObject({ code: "program_not_found" });
    } finally {
      storage.close();
    }
  });

  it("returns program_not_found when mutating a soft-deleted program without allowDeleted", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-gone") });
      await service.deleteProgram(practitionerId, id("prog-gone"));
      await expect(
        service.updateProgramName(practitionerId, id("prog-gone"), "Nope"),
      ).rejects.toMatchObject({ code: "program_not_found" });
    } finally {
      storage.close();
    }
  });

  it("requirePractitioner runs for listPrograms and listRecentlyDeletedPrograms", async () => {
    const storage = await openMigratedDatabase();
    try {
      const service = new ProgramBuilderService(storage);
      const unknown = id("practitioner-missing");
      await expect(service.listPrograms(unknown)).rejects.toMatchObject({
        code: "practitioner_not_found",
      });
      await expect(service.listRecentlyDeletedPrograms(unknown)).rejects.toMatchObject({
        code: "practitioner_not_found",
      });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService addExerciseRow guards", () => {
  it("returns exercise_not_found when pinned version belongs to another exercise", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const otherExerciseId = id("ex-other");
      await seedExercise(storage, practitionerId, otherExerciseId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-ver-mismatch"),
      });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-ver-mismatch"), {
          rowId: id("row-ver-mismatch"),
          exerciseId: otherExerciseId,
          exerciseVersionId: FIXTURE_VERSION_ID,
        }),
      ).rejects.toMatchObject({ code: "exercise_not_found" });
    } finally {
      storage.close();
    }
  });

  it("returns exercise_not_found when exercise has no approved version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const bareExerciseId = id("ex-no-version");
      await seedExercise(storage, practitionerId, bareExerciseId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-no-ver") });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-no-ver"), {
          rowId: id("row-no-ver"),
          exerciseId: bareExerciseId,
        }),
      ).rejects.toMatchObject({ code: "exercise_not_found" });
    } finally {
      storage.close();
    }
  });

  it("returns exercise_not_found when exerciseVersionId is not approved", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-draft-ver") });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-draft-ver"), {
          rowId: id("row-draft-ver"),
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
        }),
      ).rejects.toMatchObject({ code: "exercise_not_found" });
    } finally {
      storage.close();
    }
  });

  it("requires prescriptionType for strengthening exercises", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = id("ex-strength");
      const versionId = id("ver-strength");
      await seedStrengtheningApprovedExercise(
        storage,
        practitionerId,
        exerciseId,
        versionId,
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-strength") });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-strength"), {
          rowId: id("row-strength"),
          exerciseId: exerciseId,
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "prescriptionType is required for this exercise category",
      });
    } finally {
      storage.close();
    }
  });

  it("rejects prescriptionType that is not allowed for stretch category on add", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-bad-type") });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-bad-type"), {
          rowId: id("row-bad-type"),
          exerciseId: FIXTURE_EXERCISE_ID,
          prescriptionType: "isometric",
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "prescriptionType is not allowed for this exercise category",
      });
    } finally {
      storage.close();
    }
  });

  it("maps duplicate program row id to a stable invalid_input message", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-dup-id") });
      await service.addExerciseRow(practitionerId, id("prog-dup-id"), {
        rowId: id("row-shared-id"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-dup-id"), {
          rowId: id("row-shared-id"),
          exerciseId: FIXTURE_EXERCISE_ID,
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "Program row id is already in use",
      });
    } finally {
      storage.close();
    }
  });

  it("maps invalid exercise params on addExerciseRow", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-bad-params") });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-bad-params"), {
          rowId: id("row-bad-params"),
          exerciseId: FIXTURE_EXERCISE_ID,
          params: { hold_s: -1 },
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: HOLD_S_RANGE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("rejects an invalid prescriptionType literal on addExerciseRow", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-add-lit") });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-add-lit"), {
          rowId: id("row-add-lit"),
          exerciseId: FIXTURE_EXERCISE_ID,
          prescriptionType: "not-a-type" as "stretching",
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: `prescriptionType must be one of: ${PRESCRIPTION_TYPES.join(", ")}`,
      });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService updateRow guards", () => {
  it("rejects prescriptionType not allowed for category on exercise rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-upd-type") });
      await service.addExerciseRow(practitionerId, id("prog-upd-type"), {
        rowId: id("row-upd-type"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.updateRow(practitionerId, id("prog-upd-type"), id("row-upd-type"), {
          prescriptionType: "eccentric",
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "prescriptionType is not allowed for this exercise category",
      });
    } finally {
      storage.close();
    }
  });

  it("validates prescriptionType literal on placeholder updateRow", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedOpenExerciseRequest(storage, practitionerId, id("req-upd-ph"), "Move");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-upd-ph") });
      await service.addPlaceholderRow(practitionerId, id("prog-upd-ph"), {
        rowId: id("row-upd-ph"),
        exerciseRequestId: id("req-upd-ph"),
        prescriptionType: "stretching",
      });
      await expect(
        service.updateRow(practitionerId, id("prog-upd-ph"), id("row-upd-ph"), {
          prescriptionType: "not-a-type" as "stretching",
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: `prescriptionType must be one of: ${PRESCRIPTION_TYPES.join(", ")}`,
      });
    } finally {
      storage.close();
    }
  });

  it("maps invalid prescriptionType literal on exercise updateRow with exact message", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-lit-ex") });
      await service.addExerciseRow(practitionerId, id("prog-lit-ex"), {
        rowId: id("row-lit-ex"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.updateRow(practitionerId, id("prog-lit-ex"), id("row-lit-ex"), {
          prescriptionType: "not-a-type" as "stretching",
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: `prescriptionType must be one of: ${PRESCRIPTION_TYPES.join(", ")}`,
      });
    } finally {
      storage.close();
    }
  });

  it("returns exercise_not_found when pinned version is no longer approved", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-orphan-ver") });
      await service.addExerciseRow(practitionerId, id("prog-orphan-ver"), {
        rowId: id("row-orphan"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await storage.run(
        `UPDATE exercise_versions SET status = 'draft', approved_by = NULL, approved_at = NULL WHERE id = ?`,
        [FIXTURE_VERSION_ID],
      );
      await expect(
        service.updateRow(practitionerId, id("prog-orphan-ver"), id("row-orphan"), {
          params: { hold_s: 11 },
        }),
      ).rejects.toMatchObject({ code: "exercise_not_found" });
    } finally {
      storage.close();
    }
  });

  it("maps invalid params on updateRow", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-upd-params") });
      await service.addExerciseRow(practitionerId, id("prog-upd-params"), {
        rowId: id("row-upd-params"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.updateRow(practitionerId, id("prog-upd-params"), id("row-upd-params"), {
          params: { hold_s: -5 },
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: HOLD_S_RANGE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("maps placeholder updateRow note validation through mapRowWriteError", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-note-upd-ph"),
        "Move",
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-note-upd-ph"),
      });
      await service.addPlaceholderRow(practitionerId, id("prog-note-upd-ph"), {
        rowId: id("row-note-upd-ph"),
        exerciseRequestId: id("req-note-upd-ph"),
        prescriptionType: "stretching",
      });
      await expect(
        service.updateRow(
          practitionerId,
          id("prog-note-upd-ph"),
          id("row-note-upd-ph"),
          {
            note: FLAGGED_NOTE,
          },
        ),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: ROW_NOTE_PATIENT_DETAIL_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("returns program_row_not_found for a well-formed unknown row id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-unknown-row"),
      });
      await expect(
        service.updateRow(practitionerId, id("prog-unknown-row"), id("row-unknown"), {
          params: { hold_s: 10 },
        }),
      ).rejects.toMatchObject({
        code: "program_row_not_found",
        message: "Program row not found",
      });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService library row actions", () => {
  it("keepLibraryUpdateForRow rejects when no library update is pending", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-keep-none") });
      await service.addExerciseRow(practitionerId, id("prog-keep-none"), {
        rowId: id("row-keep-none"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.keepLibraryUpdateForRow(
          practitionerId,
          id("prog-keep-none"),
          id("row-keep-none"),
        ),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "No library update is available for this row",
      });
    } finally {
      storage.close();
    }
  });

  it("keepLibraryUpdateForRow rejects placeholder rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedOpenExerciseRequest(storage, practitionerId, id("req-keep-ph"), "Move");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-keep-ph") });
      await service.addPlaceholderRow(practitionerId, id("prog-keep-ph"), {
        rowId: id("row-keep-ph"),
        exerciseRequestId: id("req-keep-ph"),
        prescriptionType: "stretching",
      });
      await expect(
        service.keepLibraryUpdateForRow(
          practitionerId,
          id("prog-keep-ph"),
          id("row-keep-ph"),
        ),
      ).rejects.toMatchObject({
        code: "program_row_not_found",
        message: "Program row not found",
      });
    } finally {
      storage.close();
    }
  });

  it("keepLibraryUpdateForRow returns exercise_not_found when pinned version is not approved", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const version2Id = id("ver-lib-2");
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
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-keep-pin") });
      await service.addExerciseRow(practitionerId, id("prog-keep-pin"), {
        rowId: id("row-keep-pin"),
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
      });
      await storage.run(
        `UPDATE exercise_versions SET status = 'draft', approved_by = NULL, approved_at = NULL WHERE id = ?`,
        [FIXTURE_VERSION_ID],
      );
      await expect(
        service.keepLibraryUpdateForRow(
          practitionerId,
          id("prog-keep-pin"),
          id("row-keep-pin"),
        ),
      ).rejects.toMatchObject({ code: "exercise_not_found" });
    } finally {
      storage.close();
    }
  });

  it("applyLibraryUpdateToRow rejects placeholder rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedOpenExerciseRequest(storage, practitionerId, id("req-lib-ph"), "Move");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-lib-ph") });
      await service.addPlaceholderRow(practitionerId, id("prog-lib-ph"), {
        rowId: id("row-lib-ph"),
        exerciseRequestId: id("req-lib-ph"),
        prescriptionType: "stretching",
      });
      await expect(
        service.applyLibraryUpdateToRow(
          practitionerId,
          id("prog-lib-ph"),
          id("row-lib-ph"),
        ),
      ).rejects.toMatchObject({
        code: "program_row_not_found",
        message: "Program row not found",
      });
    } finally {
      storage.close();
    }
  });

  it("applyLibraryUpdateToRow returns exercise_not_found when library has no latest approved version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = id("ex-vanish");
      await seedExercise(storage, practitionerId, exerciseId);
      const versionId = id("ver-vanish");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
        }),
      );
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: id("prog-vanish"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await rows.replaceRow({
        id: id("row-vanish"),
        programId: id("prog-vanish"),
        position: 0,
        exerciseId,
        exerciseVersionId: versionId,
        prescriptionType: "isometric",
        params: { hold_s: 10 },
        textSnapshot: { title: "Gone" },
        note: null,
        draftUpdatedAt: TS,
      });
      await storage.run(
        `UPDATE exercise_versions SET status = 'draft', approved_by = NULL, approved_at = NULL WHERE id = ?`,
        [versionId],
      );
      const service = new ProgramBuilderService(storage);
      await expect(
        service.applyLibraryUpdateToRow(
          practitionerId,
          id("prog-vanish"),
          id("row-vanish"),
        ),
      ).rejects.toMatchObject({ code: "exercise_not_found" });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService linkApprovedPlaceholders repository guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns zero when the exercise request has no placeholder rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [practitionerId, TS, FIXTURE_VERSION_ID],
      );
      const skipped = await linkApprovedPlaceholders(
        storage,
        id("req-empty"),
        FIXTURE_VERSION_ID,
      );
      expect(skipped).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("returns exercise_not_found when approvedVersionId does not exist", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(storage, practitionerId, id("req-no-ver"), "Move");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-no-ver-link"),
      });
      await service.addPlaceholderRow(practitionerId, id("prog-no-ver-link"), {
        rowId: id("row-no-ver-link"),
        exerciseRequestId: id("req-no-ver"),
        prescriptionType: "stretching",
      });
      await markExerciseRequestApproved(storage, id("req-no-ver"), FIXTURE_EXERCISE_ID);
      await expect(
        linkApprovedPlaceholders(storage, id("req-no-ver"), id("missing-version")),
      ).rejects.toMatchObject({ code: "exercise_not_found" });
    } finally {
      storage.close();
    }
  });

  it("rejects when approved request has no exercise_id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-no-exercise-id"),
        "Move",
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-no-ex-id") });
      await service.addPlaceholderRow(practitionerId, id("prog-no-ex-id"), {
        rowId: id("row-no-ex-id"),
        exerciseRequestId: id("req-no-exercise-id"),
        prescriptionType: "stretching",
      });
      await storage.run(
        `UPDATE exercise_requests SET status = 'approved', exercise_id = NULL, updated_at = ? WHERE id = ?`,
        [TS, id("req-no-exercise-id")],
      );
      await expect(
        linkApprovedPlaceholders(storage, id("req-no-exercise-id"), FIXTURE_VERSION_ID),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: LINK_VERSION_MISMATCH_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("links placeholder rows on soft-deleted programs so restore shows linked exercises", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-del-prog"),
        "Move",
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-active-link"),
      });
      await service.createProgram(practitionerId, {
        programId: id("prog-deleted-link"),
      });
      await service.addPlaceholderRow(practitionerId, id("prog-active-link"), {
        rowId: id("row-active-link"),
        exerciseRequestId: id("req-del-prog"),
        prescriptionType: "stretching",
      });
      await service.addPlaceholderRow(practitionerId, id("prog-deleted-link"), {
        rowId: id("row-deleted-link"),
        exerciseRequestId: id("req-del-prog"),
        prescriptionType: "stretching",
      });
      await service.deleteProgram(practitionerId, id("prog-deleted-link"));
      await markExerciseRequestApproved(
        storage,
        id("req-del-prog"),
        FIXTURE_EXERCISE_ID,
      );
      const skipped = await linkApprovedPlaceholders(
        storage,
        id("req-del-prog"),
        FIXTURE_VERSION_ID,
      );
      expect(skipped).toBe(0);
      const active = await service.getProgram(practitionerId, id("prog-active-link"));
      expect(active.rows[0]?.kind).toBe("exercise");
      expect(active.rows[0]?.exercise_id).toBe(FIXTURE_EXERCISE_ID);
      expect(active.rows[0]?.exercise_version_id).toBe(FIXTURE_VERSION_ID);
      const rowsRepo = new ProgramRowsRepository(storage);
      const deletedRowWhileDeleted = await rowsRepo.findById(id("row-deleted-link"));
      expect(deletedRowWhileDeleted?.exercise_id).toBe(FIXTURE_EXERCISE_ID);
      expect(deletedRowWhileDeleted?.exercise_version_id).toBe(FIXTURE_VERSION_ID);
      expect(deletedRowWhileDeleted?.exercise_request_id).toBeNull();
      await service.restoreProgram(practitionerId, id("prog-deleted-link"));
      const restored = await service.getProgram(
        practitionerId,
        id("prog-deleted-link"),
      );
      expect(restored.rows).toHaveLength(1);
      expect(restored.rows[0]?.kind).toBe("exercise");
      expect(restored.rows[0]?.exercise_id).toBe(FIXTURE_EXERCISE_ID);
      expect(restored.rows[0]?.exercise_version_id).toBe(FIXTURE_VERSION_ID);
      expect(restored.rows[0]?.exercise_request_id).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rolls back all link writes when a row replace throws mid-link", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-write-fail"),
        "One",
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-write-fail") });
      await service.createProgram(practitionerId, {
        programId: id("prog-write-fail-2"),
      });
      await service.addPlaceholderRow(practitionerId, id("prog-write-fail"), {
        rowId: id("row-write-1"),
        exerciseRequestId: id("req-write-fail"),
        prescriptionType: "stretching",
      });
      await service.addPlaceholderRow(practitionerId, id("prog-write-fail-2"), {
        rowId: id("row-write-2"),
        exerciseRequestId: id("req-write-fail"),
        prescriptionType: "stretching",
      });
      await markExerciseRequestApproved(
        storage,
        id("req-write-fail"),
        FIXTURE_EXERCISE_ID,
      );
      const before1 = await snapshotProgramDbState(storage, id("prog-write-fail"));
      const before2 = await snapshotProgramDbState(storage, id("prog-write-fail-2"));
      const rowsRepo = new ProgramRowsRepository(storage);
      const original = ProgramRowsRepository.prototype.replaceRow;
      let calls = 0;
      vi.spyOn(ProgramRowsRepository.prototype, "replaceRow").mockImplementation(
        async function (this: ProgramRowsRepository, input) {
          calls += 1;
          await original.call(this, input);
          if (calls === 1) {
            const linked = await rowsRepo.findById(input.id);
            expect(linked?.exercise_id).toBe(FIXTURE_EXERCISE_ID);
          }
          if (calls === 2) {
            throw new Error("simulated mid-link write failure");
          }
        },
      );
      await storage.run("BEGIN");
      await expect(
        linkApprovedPlaceholders(storage, id("req-write-fail"), FIXTURE_VERSION_ID),
      ).rejects.toThrow("simulated mid-link write failure");
      await storage.run("ROLLBACK");
      const after1 = await snapshotProgramDbState(storage, id("prog-write-fail"));
      const after2 = await snapshotProgramDbState(storage, id("prog-write-fail-2"));
      expectDbStateUnchanged(before1, after1);
      expectDbStateUnchanged(before2, after2);
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService opaque id validation (extra entry points)", () => {
  const badId = "not-a-valid-opaque-id";

  it("rejects invalid program id on createProgram", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new ProgramBuilderService(storage);
      await expect(
        service.createProgram(practitionerId, { programId: badId }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: PROGRAM_ID_OPAQUE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exerciseVersionId on addExerciseRow", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-bad-pinned") });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-bad-pinned"), {
          rowId: id("row-bad-pinned"),
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: badId,
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: EXERCISE_VERSION_ID_OPAQUE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("rejects invalid newRowId on duplicateRow", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-dup-bad-new"),
      });
      await service.addExerciseRow(practitionerId, id("prog-dup-bad-new"), {
        rowId: id("row-dup-src"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.duplicateRow(practitionerId, id("prog-dup-bad-new"), {
          sourceRowId: id("row-dup-src"),
          newRowId: badId,
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: ROW_ID_OPAQUE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("rejects invalid program id on updateRow", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new ProgramBuilderService(storage);
      await expect(
        service.updateRow(practitionerId, badId, id("row-any"), {
          params: { hold_s: 1 },
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: PROGRAM_ID_OPAQUE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("rejects invalid practitioner id shape before practitioner_not_found", async () => {
    const storage = await openMigratedDatabase();
    try {
      const service = new ProgramBuilderService(storage);
      await expect(
        service.createProgram("bad-practitioner-id", { programId: id("prog-x") }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "Practitioner id must be a UUID v4 opaque id",
      });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramRowsRepository guard coverage used by program builder", () => {
  it("maps deleteRow missing row through service removeRow", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-rm-missing") });
      await expect(
        service.removeRow(practitionerId, id("prog-rm-missing"), id("row-missing")),
      ).rejects.toMatchObject({ code: "program_row_not_found" });
    } finally {
      storage.close();
    }
  });

  it("maps reorder duplicate row ids with an exact message", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-reorder-dup"),
      });
      await service.addExerciseRow(practitionerId, id("prog-reorder-dup"), {
        rowId: id("row-r1"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await service.addExerciseRow(practitionerId, id("prog-reorder-dup"), {
        rowId: id("row-r2"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.reorderRows(practitionerId, id("prog-reorder-dup"), [
          id("row-r1"),
          id("row-r1"),
        ]),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "Reorder row ids must be unique",
      });
    } finally {
      storage.close();
    }
  });

  it("maps reorder unknown row id with an exact message", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-reorder-unk"),
      });
      await service.addExerciseRow(practitionerId, id("prog-reorder-unk"), {
        rowId: id("row-unk-a"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await service.addExerciseRow(practitionerId, id("prog-reorder-unk"), {
        rowId: id("row-unk-b"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.reorderRows(practitionerId, id("prog-reorder-unk"), [
          id("row-unk-a"),
          id("row-missing-reorder"),
        ]),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "Reorder includes an unknown row id",
      });
    } finally {
      storage.close();
    }
  });

  it("maps reorder missing row count with an exact message", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-reorder-cnt"),
      });
      await service.addExerciseRow(practitionerId, id("prog-reorder-cnt"), {
        rowId: id("row-cnt-1"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await service.addExerciseRow(practitionerId, id("prog-reorder-cnt"), {
        rowId: id("row-cnt-2"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.reorderRows(practitionerId, id("prog-reorder-cnt"), [id("row-cnt-1")]),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "Reorder must include every program row",
      });
    } finally {
      storage.close();
    }
  });

  it("removeRow on a deleted program returns program_not_found", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-rm-del") });
      await service.addExerciseRow(practitionerId, id("prog-rm-del"), {
        rowId: id("row-rm-del"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await service.deleteProgram(practitionerId, id("prog-rm-del"));
      await expect(
        service.removeRow(practitionerId, id("prog-rm-del"), id("row-rm-del")),
      ).rejects.toMatchObject({ code: "program_not_found" });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService placeholder params validation", () => {
  it("maps invalid params on addPlaceholderRow", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        id("req-ph-params"),
        "Move",
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-ph-params") });
      await expect(
        service.addPlaceholderRow(practitionerId, id("prog-ph-params"), {
          rowId: id("row-ph-params"),
          exerciseRequestId: id("req-ph-params"),
          prescriptionType: "stretching",
          params: { hold_s: -99 },
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: HOLD_S_RANGE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService getProgram deleted view", () => {
  it("returns no rows when program is deleted but allowDeleted is used", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-del-view") });
      await service.addExerciseRow(practitionerId, id("prog-del-view"), {
        rowId: id("row-del-view"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await service.deleteProgram(practitionerId, id("prog-del-view"));
      const view = await service.getProgram(practitionerId, id("prog-del-view"));
      expect(view.rows).toHaveLength(0);
      expect(view.open_share_link).toBe(false);
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService malformed program id parsing", () => {
  async function seedProgramWithRow(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
    practitionerId: string,
  ) {
    await seedApprovedExerciseForBuilder(storage, practitionerId);
    const service = new ProgramBuilderService(storage);
    await service.createProgram(practitionerId, { programId: id("prog-parse") });
    await service.addExerciseRow(practitionerId, id("prog-parse"), {
      rowId: id("row-parse"),
      exerciseId: FIXTURE_EXERCISE_ID,
    });
    await seedOpenExerciseRequest(storage, practitionerId, id("req-parse"), "Move");
    await service.addPlaceholderRow(practitionerId, id("prog-parse"), {
      rowId: id("row-ph-parse"),
      exerciseRequestId: id("req-parse"),
      prescriptionType: "stretching",
    });
    return service;
  }

  it.each([
    [
      "addPlaceholderRow",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.addPlaceholderRow(practitionerId, BAD_OPAQUE_ID, {
          rowId: id("row-new"),
          exerciseRequestId: id("req-parse"),
          prescriptionType: "stretching",
        }),
    ],
    [
      "duplicateRow",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.duplicateRow(practitionerId, BAD_OPAQUE_ID, {
          sourceRowId: id("row-parse"),
          newRowId: id("row-dup-new"),
        }),
    ],
    [
      "removeRow",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.removeRow(practitionerId, BAD_OPAQUE_ID, id("row-parse")),
    ],
    [
      "reorderRows",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.reorderRows(practitionerId, BAD_OPAQUE_ID, [id("row-parse")]),
    ],
    [
      "applyLibraryUpdateToRow",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.applyLibraryUpdateToRow(practitionerId, BAD_OPAQUE_ID, id("row-parse")),
    ],
    [
      "keepLibraryUpdateForRow",
      (s: ProgramBuilderService, practitionerId: string) =>
        s.keepLibraryUpdateForRow(practitionerId, BAD_OPAQUE_ID, id("row-parse")),
    ],
  ])(
    "%s rejects malformed program id before program_not_found",
    async (_name, invoke) => {
      const storage = await openMigratedDatabase();
      try {
        const practitionerId = await seedPractitioner(storage);
        const service = await seedProgramWithRow(storage, practitionerId);
        await expect(invoke(service, practitionerId)).rejects.toMatchObject({
          code: "invalid_input",
          message: PROGRAM_ID_OPAQUE_MESSAGE,
        });
      } finally {
        storage.close();
      }
    },
  );
});

describe("ProgramBuilderService malformed row id parsing", () => {
  it("addExerciseRow maps malformed row id to invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-bad-row-add"),
      });
      await expect(
        service.addExerciseRow(practitionerId, id("prog-bad-row-add"), {
          rowId: BAD_OPAQUE_ID,
          exerciseId: FIXTURE_EXERCISE_ID,
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: ROW_ID_OPAQUE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("addPlaceholderRow maps malformed row id to invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedOpenExerciseRequest(storage, practitionerId, id("req-bad-row"), "Move");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-bad-row-ph") });
      await expect(
        service.addPlaceholderRow(practitionerId, id("prog-bad-row-ph"), {
          rowId: BAD_OPAQUE_ID,
          exerciseRequestId: id("req-bad-row"),
          prescriptionType: "stretching",
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: ROW_ID_OPAQUE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("reorderRows maps malformed ordered row id to invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-reorder-bad-id"),
      });
      await service.addExerciseRow(practitionerId, id("prog-reorder-bad-id"), {
        rowId: id("row-reorder-ok"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.reorderRows(practitionerId, id("prog-reorder-bad-id"), [BAD_OPAQUE_ID]),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: ROW_ID_OPAQUE_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService restoreProgram guards", () => {
  it("surfaces Program is not deleted when restoring an active program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-active-restore"),
      });
      await expect(
        service.restoreProgram(practitionerId, id("prog-active-restore")),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "Program is not deleted",
      });
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService detectLibraryUpdate integration", () => {
  it("shows no library update when the row is pinned to the latest approved version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const version2Id = id("ver-latest-pin");
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
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-latest-pin") });
      await service.addExerciseRow(practitionerId, id("prog-latest-pin"), {
        rowId: id("row-latest-pin"),
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: version2Id,
      });
      const view = await service.getProgram(practitionerId, id("prog-latest-pin"));
      expect(view.library_updates_to_review).toBe(0);
      expect(view.rows[0]?.library_update).toBeNull();
    } finally {
      storage.close();
    }
  });
});

describe("ProgramBuilderService mapRowWriteError paths", () => {
  it("maps addPlaceholderRow note validation through mapRowWriteError", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedOpenExerciseRequest(storage, practitionerId, id("req-note-ph"), "Move");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-note-ph") });
      await expect(
        service.addPlaceholderRow(practitionerId, id("prog-note-ph"), {
          rowId: id("row-note-ph"),
          exerciseRequestId: id("req-note-ph"),
          prescriptionType: "stretching",
          note: FLAGGED_NOTE,
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: ROW_NOTE_PATIENT_DETAIL_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("maps updateRow note validation through mapRowWriteError", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-note-upd") });
      await service.addExerciseRow(practitionerId, id("prog-note-upd"), {
        rowId: id("row-note-upd"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.updateRow(practitionerId, id("prog-note-upd"), id("row-note-upd"), {
          note: FLAGGED_NOTE,
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: ROW_NOTE_PATIENT_DETAIL_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("maps duplicateRow write failures through mapRowWriteError", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-dup-map") });
      await service.addExerciseRow(practitionerId, id("prog-dup-map"), {
        rowId: id("row-dup-src-map"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.duplicateRow(practitionerId, id("prog-dup-map"), {
          sourceRowId: id("row-dup-src-map"),
          newRowId: id("row-dup-src-map"),
        }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "Program row id is already in use",
      });
    } finally {
      storage.close();
    }
  });

  it("maps applyLibraryUpdateToRow note validation through mapRowWriteError", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const version2Id = id("ver-apply-note");
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
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-note-apply") });
      await service.addExerciseRow(practitionerId, id("prog-note-apply"), {
        rowId: id("row-note-apply"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await storage.run(`UPDATE program_rows SET note = ? WHERE id = ?`, [
        FLAGGED_NOTE,
        id("row-note-apply"),
      ]);
      await expect(
        service.applyLibraryUpdateToRow(
          practitionerId,
          id("prog-note-apply"),
          id("row-note-apply"),
        ),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: ROW_NOTE_PATIENT_DETAIL_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });

  it("maps keepLibraryUpdateForRow note validation through mapRowWriteError", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-note-keep") });
      await service.addExerciseRow(practitionerId, id("prog-note-keep"), {
        rowId: id("row-note-keep"),
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
      });
      const version2Id = id("ver-keep-note");
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
      await storage.run(`UPDATE program_rows SET note = ? WHERE id = ?`, [
        FLAGGED_NOTE,
        id("row-note-keep"),
      ]);
      await expect(
        service.keepLibraryUpdateForRow(
          practitionerId,
          id("prog-note-keep"),
          id("row-note-keep"),
        ),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: ROW_NOTE_PATIENT_DETAIL_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });
});
