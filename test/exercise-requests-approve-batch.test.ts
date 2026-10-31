import { describe, expect, it } from "vitest";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  PractitionerExercisesRepository,
} from "../src/storage/repositories/exercise-data.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
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

  it("approveRequest commits approve and link through one sql.batch call", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pract-batch-once-req"),
        "bor@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("pract-batch-once-app"),
        "boa@example.com",
      );
      let batchCalls = 0;
      let approveVersionRunCalls = 0;
      const tracking: SqlStoragePort = {
        run: async (sql, bindings) => {
          const normalized = sql.trim().replace(/\s+/g, " ");
          if (
            normalized.includes("UPDATE exercise_versions") &&
            normalized.includes("status = 'approved'")
          ) {
            approveVersionRunCalls += 1;
          }
          return storage.run(sql, bindings);
        },
        all: (sql, bindings) => storage.all(sql, bindings),
        first: (sql, bindings) => storage.first(sql, bindings),
        batch: async (statements) => {
          batchCalls += 1;
          return storage.batch(statements);
        },
      };
      const service = new ExerciseRequestsService(tracking, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Single batch move",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        return;
      }
      await service.approveRequest({
        practitionerId: approver,
        requestId: created.request_id,
      });
      expect(batchCalls).toBe(1);
      expect(approveVersionRunCalls).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("rolls back earlier approve writes when a guarded batch statement fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pract-batch-rollback-req"),
        "brr@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("pract-batch-rollback-app"),
        "bra@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Batch rollback move",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created" || !created.exercise_id) {
        return;
      }
      const versions = new ExerciseVersionsRepository(storage);
      const draft = await versions.findDraftForExercise(created.exercise_id);
      expect(draft).not.toBeNull();
      if (!draft) {
        return;
      }
      const requestsRepo = new ExerciseRequestsRepository(storage);
      const myExercises = new PractitionerExercisesRepository(storage);
      const programBuilder = new ProgramBuilderService(storage);
      const { statements: linkStatements } =
        await programBuilder.buildLinkApprovedPlaceholderStatements(
          created.request_id,
          draft.id,
        );
      const batchStatements = [
        versions.buildApproveDraftBatchStatement({
          versionId: draft.id,
          approvedBy: approver,
          approvedAt: AFTER_FORM,
        }),
        requestsRepo.buildUpdateStatusBatchStatement({
          id: created.request_id,
          status: "approved",
          updatedAt: AFTER_FORM,
          allowedFromStatuses: ["drafting"],
        }),
        myExercises.buildSaveExerciseBatchStatement({
          practitionerId: requester,
          exerciseId: created.exercise_id,
          savedAt: AFTER_FORM,
        }),
        ...linkStatements,
      ];
      const failing = [...batchStatements];
      failing[1] = { ...failing[1]!, minRowsAffected: 999 };
      await expect(storage.batch(failing)).rejects.toThrow();

      const versionRow = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_versions WHERE id = ?",
        [draft.id],
      );
      expect(versionRow?.status).toBe("draft");
      const requestRow = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [created.request_id],
      );
      expect(requestRow?.status).toBe("drafting");
    } finally {
      storage.close();
    }
  });
});
