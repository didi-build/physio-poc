import { describe, expect, it } from "vitest";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";

const FORM_OPENED = "2026-10-30T10:00:00.000Z";
const AFTER_FORM = "2026-10-30T11:00:00.000Z";

describe("Exercise request approve batch (integration)", () => {
  it("links program placeholders in the same approve batch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pract-batch-link-req"),
        "blr@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("pract-batch-link-app"),
        "bla@example.com",
      );
      await seedApprovedExerciseVersion(storage, approver);
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Batch link move",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        return;
      }

      const programBuilder = new ProgramBuilderService(storage);
      const programId = id("prog-batch-link");
      await programBuilder.createProgram(requester, { programId });
      const rowId = id("row-batch-link");
      await programBuilder.addPlaceholderRow(requester, programId, {
        rowId,
        exerciseRequestId: created.request_id,
        prescriptionType: "stretching",
        params: { hold_s: 20 },
      });

      const approvedAt = "2026-10-30T15:30:00.000Z";
      const approveService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => approvedAt,
      });
      const approved = await approveService.approveRequest({
        practitionerId: approver,
        requestId: created.request_id,
      });

      const linked = await storage.first<{ exercise_version_id: string | null }>(
        `SELECT exercise_version_id FROM program_rows WHERE id = ?`,
        [rowId],
      );
      expect(linked?.exercise_version_id).toBe(approved.exercise_version_id);

      const requestRow = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [created.request_id],
      );
      expect(requestRow?.status).toBe("approved");
    } finally {
      storage.close();
    }
  });

  it("does not leave a placeholder unlinked when approve batch guard fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pract-batch-fail-req"),
        "bfr@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("pract-batch-fail-app"),
        "bfa@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Batch fail move",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created" || !created.exercise_id) {
        return;
      }

      await seedApprovedExerciseVersion(storage, approver);
      const programBuilder = new ProgramBuilderService(storage);
      const programId = id("prog-batch-fail");
      await programBuilder.createProgram(requester, { programId });
      const rowId = id("row-batch-fail");
      await programBuilder.addPlaceholderRow(requester, programId, {
        rowId,
        exerciseRequestId: created.request_id,
        prescriptionType: "stretching",
        params: { hold_s: 15 },
      });

      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ?
         WHERE exercise_id = ? AND status = 'draft'`,
        [approver, AFTER_FORM, created.exercise_id],
      );

      await expect(
        service.approveRequest({
          practitionerId: approver,
          requestId: created.request_id,
        }),
      ).rejects.toMatchObject({ code: "draft_not_ready" });

      const linked = await storage.first<{ exercise_version_id: string | null }>(
        `SELECT exercise_version_id FROM program_rows WHERE id = ?`,
        [rowId],
      );
      expect(linked?.exercise_version_id).toBeNull();

      const requestRow = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [created.request_id],
      );
      expect(requestRow?.status).toBe("drafting");
    } finally {
      storage.close();
    }
  });

  it("does not approve the request when status is not drafting at approve time", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pract-batch-status-req"),
        "bsr@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("pract-batch-status-app"),
        "bsa@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Wrong status approve",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        return;
      }
      await storage.run(
        `UPDATE exercise_requests SET status = 'open', updated_at = ? WHERE id = ?`,
        [AFTER_FORM, created.request_id],
      );
      await expect(
        service.approveRequest({
          practitionerId: approver,
          requestId: created.request_id,
        }),
      ).rejects.toMatchObject({ code: "draft_not_ready" });

      const requestRow = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [created.request_id],
      );
      expect(requestRow?.status).toBe("open");
    } finally {
      storage.close();
    }
  });
});
