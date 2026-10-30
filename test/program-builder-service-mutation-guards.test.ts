import { afterEach, describe, expect, it, vi } from "vitest";
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
        s.reorderRows(b, id("prog-b"), [id("row-a"), id("row-b")]),
      "invalid_input" as const,
    ],
  ])(
    "%s rejects another practitioner's row id on B's program without changing A",
    async (_name, invoke, expectedCode?: "program_row_not_found" | "invalid_input") => {
      const code = expectedCode ?? "program_row_not_found";
      const storage = await openMigratedDatabase();
      try {
        const { practitionerB, serviceB } = await seedRowIsolationFixture(storage);
        const beforeA = await snapshotProgramDbState(storage, id("prog-a"));
        const beforeB = await snapshotProgramDbState(storage, id("prog-b"));
        await expect(invoke(serviceB, practitionerB)).rejects.toMatchObject({
          code,
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
      ).rejects.toMatchObject({ code: "invalid_input" });
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
      ).rejects.toMatchObject({ code: "invalid_input" });
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
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });

  it("skips placeholder rows on deleted programs without linking them", async () => {
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
      await linkApprovedPlaceholders(storage, id("req-del-prog"), FIXTURE_VERSION_ID);
      const active = await service.getProgram(practitionerId, id("prog-active-link"));
      expect(active.rows[0]?.kind).toBe("exercise");
      const deletedView = await service.getProgram(
        practitionerId,
        id("prog-deleted-link"),
      );
      expect(deletedView.rows).toHaveLength(0);
      const rowsRepo = new ProgramRowsRepository(storage);
      const deletedRow = await rowsRepo.findById(id("row-deleted-link"));
      expect(deletedRow?.exercise_request_id).toBe(id("req-del-prog"));
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
      const original = ProgramRowsRepository.prototype.replaceRow;
      let calls = 0;
      vi.spyOn(ProgramRowsRepository.prototype, "replaceRow").mockImplementation(
        async function (this: ProgramRowsRepository, input) {
          calls += 1;
          if (calls === 2) {
            throw new Error("simulated mid-link write failure");
          }
          return original.call(this, input);
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
      ).rejects.toMatchObject({ code: "invalid_input" });
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
      ).rejects.toMatchObject({ code: "invalid_input" });
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
      ).rejects.toMatchObject({ code: "invalid_input" });
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
      ).rejects.toMatchObject({ code: "invalid_input" });
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
      ).rejects.toMatchObject({ code: "invalid_input" });
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

  it("maps reorderRows validation errors through service", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-reorder") });
      await service.addExerciseRow(practitionerId, id("prog-reorder"), {
        rowId: id("row-r1"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await expect(
        service.reorderRows(practitionerId, id("prog-reorder"), [
          id("row-r1"),
          id("row-r1"),
        ]),
      ).rejects.toMatchObject({ code: "invalid_input" });
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
      ).rejects.toMatchObject({ code: "invalid_input" });
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
