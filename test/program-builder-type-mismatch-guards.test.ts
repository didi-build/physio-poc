import { describe, expect, it } from "vitest";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { ProgramRowsRepository } from "../src/storage/repositories/programs.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

describe("type-mismatch ownership guards (DIDI-1106)", () => {
  it("linkTypeMismatchPlaceholderRow rejects another practitioner's exercise request and leaves the row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerA = await seedPractitioner(
        storage,
        id("ph-guard-a"),
        "ga@example.com",
      );
      const ownerB = await seedPractitioner(
        storage,
        id("ph-guard-b"),
        "gb@example.com",
      );
      await seedApprovedExerciseVersion(storage, ownerB);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [ownerB, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-guard-link");
      const reqB = id("req-guard-b");
      const rowId = id("row-guard");
      await service.createProgram(ownerA, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqB,
        requestedName: "Foreign request",
        requestedBy: ownerB,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      await storage.run(
        `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ?`,
        [FIXTURE_EXERCISE_ID, TS, reqB],
      );
      await storage.run(
        `INSERT INTO program_rows (
          id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
          prescription_type, params_json, text_snapshot_json, note
        ) VALUES (?, ?, 0, NULL, NULL, ?, 'stretching', '{}', ?, NULL)`,
        [rowId, programId, reqB, JSON.stringify({ title: "Foreign request" })],
      );
      const view = await service.getProgram(ownerA, programId);
      const rowsRepo = new ProgramRowsRepository(storage);
      const before = await rowsRepo.findById(rowId);
      await expect(
        service.linkTypeMismatchPlaceholderRow(
          ownerA,
          programId,
          rowId,
          "stretching",
          view.draft_updated_at,
        ),
      ).rejects.toMatchObject({
        code: "exercise_request_not_found",
        message: "Exercise request not found",
      });
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("undoTypeMismatchPlaceholderLink refuses another practitioner's program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerA = await seedPractitioner(
        storage,
        id("ph-guard-ua"),
        "gua@example.com",
      );
      const ownerB = await seedPractitioner(
        storage,
        id("ph-guard-ub"),
        "gub@example.com",
      );
      await seedApprovedExerciseVersion(storage, ownerA);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [ownerA, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-guard-undo");
      const reqId = id("req-guard-undo");
      const rowId = id("row-guard-undo");
      await service.createProgram(ownerA, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqId,
        requestedName: "Local",
        requestedBy: ownerA,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      await service.addPlaceholderRow(ownerA, programId, {
        rowId,
        exerciseRequestId: reqId,
        prescriptionType: "isometric",
      });
      await storage.run(
        `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ?`,
        [FIXTURE_EXERCISE_ID, TS, reqId],
      );
      const view = await service.getProgram(ownerA, programId);
      const linked = await service.linkTypeMismatchPlaceholderRow(
        ownerA,
        programId,
        rowId,
        "stretching",
        view.draft_updated_at,
      );
      const rowsRepo = new ProgramRowsRepository(storage);
      const before = await rowsRepo.findById(rowId);
      await expect(
        service.undoTypeMismatchPlaceholderLink(
          ownerB,
          programId,
          rowId,
          linked.program.draft_updated_at,
        ),
      ).rejects.toMatchObject({ code: "program_not_found" });
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });
});
