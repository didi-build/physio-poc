import { describe, expect, it } from "vitest";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import { linkApprovedPlaceholders } from "../src/services/programs/program-builder-service.js";
import { ProgramRowsRepository } from "../src/storage/repositories/programs.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";

const FORM_OPENED = "2026-10-30T10:00:00.000Z";
const AFTER_FORM = "2026-10-30T11:00:00.000Z";
const APPROVE_AT = "2026-10-30T15:30:00.000Z";

async function submitDraftingRequest(
  storage: SqlStoragePort,
  requester: string,
  approver: string,
  requestedName: string,
  options?: { seedApproverLibrary?: boolean },
): Promise<{ requestId: string; exerciseId: string; draftVersionId: string }> {
  if (options?.seedApproverLibrary !== false) {
    await seedApprovedExerciseVersion(storage, approver);
  }
  const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
    now: () => AFTER_FORM,
  });
  const created = await service.submitRequest({
    practitionerId: requester,
    requestedName,
    formOpenedAt: FORM_OPENED,
  });
  expect(created.outcome).toBe("created");
  if (created.outcome !== "created" || !created.exercise_id) {
    throw new Error("expected created request");
  }
  const draft = await storage.first<{ id: string }>(
    `SELECT id FROM exercise_versions WHERE exercise_id = ? AND status = 'draft' LIMIT 1`,
    [created.exercise_id],
  );
  if (!draft) {
    throw new Error("expected draft version");
  }
  return {
    requestId: created.request_id,
    exerciseId: created.exercise_id,
    draftVersionId: draft.id,
  };
}

describe("Exercise request approve placeholder linking acceptance (DIDI-1137)", () => {
  it("approveRequest links placeholders on soft-deleted programs to the approved version id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("ac-soft-req"),
        "softreq@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("ac-soft-app"),
        "softapp@example.com",
      );
      const { requestId, draftVersionId } = await submitDraftingRequest(
        storage,
        requester,
        approver,
        "Soft deleted link",
      );
      const programBuilder = new ProgramBuilderService(storage);
      const programId = id("prog-ac-soft");
      await programBuilder.createProgram(requester, { programId });
      const rowId = id("row-ac-soft");
      await programBuilder.addPlaceholderRow(requester, programId, {
        rowId,
        exerciseRequestId: requestId,
        prescriptionType: "stretching",
      });
      await programBuilder.deleteProgram(requester, programId);

      const approveService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => APPROVE_AT,
      });
      const approved = await approveService.approveRequest({
        practitionerId: approver,
        requestId,
      });

      const row = await new ProgramRowsRepository(storage).findById(rowId);
      expect(row?.exercise_version_id).toBe(approved.exercise_version_id);
      expect(approved.exercise_version_id).toBe(draftVersionId);
      expect(row?.exercise_request_id).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("approveRequest pins the approved draft version id when a newer approved version exists on the exercise", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("ac-pin-req"),
        "pinreq@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("ac-pin-app"),
        "pinapp@example.com",
      );
      const { requestId, exerciseId, draftVersionId } = await submitDraftingRequest(
        storage,
        requester,
        approver,
        "Version pin link",
      );
      const newerVersionId = id("ver-ac-pin-newer");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: newerVersionId,
          exercise_id: exerciseId,
          version_number: 2,
          status: "approved",
          approved_by: approver,
          approved_at: AFTER_FORM,
          title: "Newer approved",
        }),
      );
      const programBuilder = new ProgramBuilderService(storage);
      const programId = id("prog-ac-pin");
      await programBuilder.createProgram(requester, { programId });
      const rowId = id("row-ac-pin");
      await programBuilder.addPlaceholderRow(requester, programId, {
        rowId,
        exerciseRequestId: requestId,
        prescriptionType: "stretching",
      });

      const approveService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => APPROVE_AT,
      });
      const approved = await approveService.approveRequest({
        practitionerId: approver,
        requestId,
      });

      const row = await new ProgramRowsRepository(storage).findById(rowId);
      expect(approved.exercise_version_id).toBe(draftVersionId);
      expect(row?.exercise_version_id).toBe(draftVersionId);
      expect(row?.exercise_version_id).not.toBe(newerVersionId);
    } finally {
      storage.close();
    }
  });

  it("approveRequest returns skipped_count for type-mismatched placeholders and leaves them unlinked", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("ac-skip-req"),
        "skipreq@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("ac-skip-app"),
        "skipapp@example.com",
      );
      const { requestId } = await submitDraftingRequest(
        storage,
        requester,
        approver,
        "Skip mismatch",
      );
      const programBuilder = new ProgramBuilderService(storage);
      const programId = id("prog-ac-skip");
      await programBuilder.createProgram(requester, { programId });
      const fitRowId = id("row-ac-skip-fit");
      const skipRowId = id("row-ac-skip-misfit");
      await programBuilder.addPlaceholderRow(requester, programId, {
        rowId: fitRowId,
        exerciseRequestId: requestId,
        prescriptionType: "stretching",
      });
      await programBuilder.addPlaceholderRow(requester, programId, {
        rowId: skipRowId,
        exerciseRequestId: requestId,
        prescriptionType: "isometric",
        note: "misfit",
      });

      const approveService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => APPROVE_AT,
      });
      const approved = await approveService.approveRequest({
        practitionerId: approver,
        requestId,
      });

      expect(approved.skipped_count).toBe(1);
      const fitRow = await new ProgramRowsRepository(storage).findById(fitRowId);
      expect(fitRow?.exercise_request_id).toBeNull();
      const skipRow = await new ProgramRowsRepository(storage).findById(skipRowId);
      expect(skipRow?.exercise_request_id).toBe(requestId);
      expect(skipRow?.exercise_id).toBeNull();
      expect(skipRow?.exercise_version_id).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("approveRequest links only placeholders for the approved exercise request", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("ac-scope-req"),
        "scopereq@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("ac-scope-app"),
        "scopeapp@example.com",
      );
      const requestA = await submitDraftingRequest(
        storage,
        requester,
        approver,
        "Scope A",
      );
      const requestB = await submitDraftingRequest(
        storage,
        requester,
        approver,
        "Scope B",
        { seedApproverLibrary: false },
      );
      const programBuilder = new ProgramBuilderService(storage);
      const programId = id("prog-ac-scope");
      await programBuilder.createProgram(requester, { programId });
      const rowAId = id("row-ac-scope-a");
      const rowBId = id("row-ac-scope-b");
      await programBuilder.addPlaceholderRow(requester, programId, {
        rowId: rowAId,
        exerciseRequestId: requestA.requestId,
        prescriptionType: "stretching",
      });
      await programBuilder.addPlaceholderRow(requester, programId, {
        rowId: rowBId,
        exerciseRequestId: requestB.requestId,
        prescriptionType: "stretching",
      });

      const approveService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => APPROVE_AT,
      });
      await approveService.approveRequest({
        practitionerId: approver,
        requestId: requestA.requestId,
      });

      const rowA = await new ProgramRowsRepository(storage).findById(rowAId);
      expect(rowA?.exercise_request_id).toBeNull();
      const rowB = await new ProgramRowsRepository(storage).findById(rowBId);
      expect(rowB?.exercise_request_id).toBe(requestB.requestId);
      expect(rowB?.exercise_id).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("linkApprovedPlaceholders after approveRequest links nothing new and does not throw", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("ac-idem-req"),
        "idemreq@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("ac-idem-app"),
        "idemapp@example.com",
      );
      const { requestId } = await submitDraftingRequest(
        storage,
        requester,
        approver,
        "Idempotent link",
      );
      const programBuilder = new ProgramBuilderService(storage);
      const programId = id("prog-ac-idem");
      await programBuilder.createProgram(requester, { programId });
      const rowId = id("row-ac-idem");
      await programBuilder.addPlaceholderRow(requester, programId, {
        rowId,
        exerciseRequestId: requestId,
        prescriptionType: "stretching",
      });

      const approveService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => APPROVE_AT,
      });
      const approved = await approveService.approveRequest({
        practitionerId: approver,
        requestId,
      });
      const rowBefore = await new ProgramRowsRepository(storage).findById(rowId);

      const skippedAgain = await linkApprovedPlaceholders(
        storage,
        requestId,
        approved.exercise_version_id,
      );
      expect(skippedAgain).toBe(0);

      const rowAfter = await new ProgramRowsRepository(storage).findById(rowId);
      expect(rowAfter?.exercise_version_id).toBe(rowBefore?.exercise_version_id);
      expect(rowAfter?.exercise_id).toBe(rowBefore?.exercise_id);
    } finally {
      storage.close();
    }
  });
});
