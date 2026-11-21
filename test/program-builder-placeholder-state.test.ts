import { describe, expect, it } from "vitest";
import {
  ProgramBuilderService,
  linkApprovedPlaceholders,
} from "../src/services/programs/program-builder-service.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

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

describe("getProgram placeholder_state (DIDI-1106)", () => {
  it("derivates awaiting_approval, type_mismatch, request_closed, linked rows, and per-request isolation", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerA = await seedPractitioner(storage, id("ph-a"), "a@example.com");
      const ownerB = await seedPractitioner(storage, id("ph-b"), "b@example.com");
      await seedApprovedExerciseVersion(storage, ownerB);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [ownerB, TS, FIXTURE_VERSION_ID],
      );

      const requestOpen = id("req-open");
      const requestApproved = id("req-approved");
      const requestWithdrawn = id("req-withdrawn");
      await seedOpenExerciseRequest(storage, ownerA, requestOpen, "Open draft");
      await seedOpenExerciseRequest(storage, ownerA, requestApproved, "Approved draft");
      await seedOpenExerciseRequest(
        storage,
        ownerA,
        requestWithdrawn,
        "Withdrawn draft",
      );

      const service = new ProgramBuilderService(storage);
      const programId = id("prog-ph-state");
      await service.createProgram(ownerA, { programId });

      const rowAwaiting = id("row-await");
      const rowMismatch = id("row-mismatch");
      const rowClosed = id("row-closed");
      const rowLinked = id("row-linked");
      const rowOtherRequest = id("row-other-req");

      await service.addPlaceholderRow(ownerA, programId, {
        rowId: rowAwaiting,
        exerciseRequestId: requestOpen,
        prescriptionType: "stretching",
      });
      await service.addPlaceholderRow(ownerA, programId, {
        rowId: rowMismatch,
        exerciseRequestId: requestApproved,
        prescriptionType: "isometric",
      });
      await service.addPlaceholderRow(ownerA, programId, {
        rowId: rowClosed,
        exerciseRequestId: requestWithdrawn,
        prescriptionType: "stretching",
      });
      await service.addPlaceholderRow(ownerA, programId, {
        rowId: rowLinked,
        exerciseRequestId: requestApproved,
        prescriptionType: "stretching",
      });
      await seedOpenExerciseRequest(storage, ownerB, id("req-other"), "Other owner");
      await service.addPlaceholderRow(ownerA, programId, {
        rowId: rowOtherRequest,
        exerciseRequestId: requestOpen,
        prescriptionType: "stretching",
      });

      await storage.run(
        `UPDATE exercise_requests SET status = 'withdrawn', updated_at = ? WHERE id = ?`,
        [TS, requestWithdrawn],
      );
      await markExerciseRequestApproved(storage, requestApproved, FIXTURE_EXERCISE_ID);
      await linkApprovedPlaceholders(storage, requestApproved, FIXTURE_VERSION_ID);

      const view = await service.getProgram(ownerA, programId);
      const byId = new Map(view.rows.map((row) => [row.id, row]));

      expect(byId.get(rowAwaiting)?.placeholder_state).toBe("awaiting_approval");
      expect(byId.get(rowMismatch)?.placeholder_state).toBe("type_mismatch");
      expect(byId.get(rowMismatch)?.type_mismatch_approved_category).toBe("stretching");
      expect(byId.get(rowClosed)?.placeholder_state).toBe("request_closed");
      expect(byId.get(rowLinked)?.kind).toBe("exercise");
      expect(byId.get(rowLinked)?.placeholder_state).toBeUndefined();
      expect(byId.get(rowOtherRequest)?.placeholder_state).toBe("awaiting_approval");
      expect(view.type_mismatch_placeholder_count).toBe(1);
    } finally {
      storage.close();
    }
  });
});
