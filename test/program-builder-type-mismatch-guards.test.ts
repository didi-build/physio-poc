import { describe, expect, it } from "vitest";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
} from "../src/services/programs/program-builder-service.js";
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

const PROGRAM_NOT_FOUND_ERROR = "program_not_found";
const PROGRAM_NOT_FOUND_MESSAGE = "Program not found";
const EXERCISE_REQUEST_NOT_FOUND_ERROR = "exercise_request_not_found";
const EXERCISE_REQUEST_NOT_FOUND_MESSAGE = "Exercise request not found";

function expectServiceProgramNotFound(err: unknown): void {
  const error = err as ProgramBuilderServiceError;
  expect(error.code).toBe("program_not_found");
  expect(error.message).toBe("Program not found");
  expect(error.code).toBe(PROGRAM_NOT_FOUND_ERROR);
  expect(error.message).toBe(PROGRAM_NOT_FOUND_MESSAGE);
}

function expectServiceExerciseRequestNotFound(err: unknown): void {
  const error = err as ProgramBuilderServiceError;
  expect(error.code).toBe("exercise_request_not_found");
  expect(error.message).toBe("Exercise request not found");
  expect(error.code).toBe(EXERCISE_REQUEST_NOT_FOUND_ERROR);
  expect(error.message).toBe(EXERCISE_REQUEST_NOT_FOUND_MESSAGE);
}

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
      try {
        await service.linkTypeMismatchPlaceholderRow(
          ownerA,
          programId,
          rowId,
          "stretching",
          view.draft_updated_at,
        );
        expect.unreachable("link should refuse foreign exercise request");
      } catch (err) {
        expectServiceExerciseRequestNotFound(err);
      }
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("undoTypeMismatchPlaceholderLink refuses when the snapshot request belongs to another practitioner", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerA = await seedPractitioner(storage, id("ph-u2-a"), "u2a@example.com");
      const ownerB = await seedPractitioner(storage, id("ph-u2-b"), "u2b@example.com");
      await seedApprovedExerciseVersion(storage, ownerA);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [ownerA, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-u2");
      const reqId = id("req-u2");
      const rowId = id("row-u2");
      await service.createProgram(ownerA, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqId,
        requestedName: "Quad set",
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
      await storage.run(`UPDATE exercise_requests SET requested_by = ? WHERE id = ?`, [
        ownerB,
        reqId,
      ]);
      const rowsRepo = new ProgramRowsRepository(storage);
      const before = await rowsRepo.findById(rowId);
      try {
        await service.undoTypeMismatchPlaceholderLink(
          ownerA,
          programId,
          rowId,
          linked.program.draft_updated_at,
        );
        expect.unreachable("undo should refuse foreign exercise request");
      } catch (err) {
        expectServiceExerciseRequestNotFound(err);
      }
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("undoTypeMismatchPlaceholderLink refuses another practitioner's program with the program_not_found message literal", async () => {
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
      try {
        await service.undoTypeMismatchPlaceholderLink(
          ownerB,
          programId,
          rowId,
          linked.program.draft_updated_at,
        );
        expect.unreachable("undo should refuse foreign program");
      } catch (err) {
        expectServiceProgramNotFound(err);
      }
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("undoTypeMismatchPlaceholderLink rejects undo on a row that is still a placeholder", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-guard-u2"),
        "u2@example.com",
      );
      await seedApprovedExerciseVersion(storage, owner);
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-guard-u2");
      const reqId = id("req-guard-u2");
      const rowId = id("row-guard-u2");
      await service.createProgram(owner, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqId,
        requestedName: "Open draft",
        requestedBy: owner,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      await service.addPlaceholderRow(owner, programId, {
        rowId,
        exerciseRequestId: reqId,
        prescriptionType: "stretching",
      });
      const view = await service.getProgram(owner, programId);
      const rowsRepo = new ProgramRowsRepository(storage);
      const before = await rowsRepo.findById(rowId);
      await expect(
        service.undoTypeMismatchPlaceholderLink(
          owner,
          programId,
          rowId,
          view.draft_updated_at,
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("undoTypeMismatchPlaceholderLink rejects when approved request title no longer matches snapshot", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-guard-u3"),
        "u3@example.com",
      );
      await seedApprovedExerciseVersion(storage, owner);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [owner, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-guard-u3");
      const reqId = id("req-guard-u3");
      const rowId = id("row-guard-u3");
      await service.createProgram(owner, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqId,
        requestedName: "Stored title",
        requestedBy: owner,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      await service.addPlaceholderRow(owner, programId, {
        rowId,
        exerciseRequestId: reqId,
        prescriptionType: "isometric",
      });
      await storage.run(`UPDATE program_rows SET text_snapshot_json = ? WHERE id = ?`, [
        JSON.stringify({ title: "Different title" }),
        rowId,
      ]);
      await storage.run(
        `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ?`,
        [FIXTURE_EXERCISE_ID, TS, reqId],
      );
      const view = await service.getProgram(owner, programId);
      const linked = await service.linkTypeMismatchPlaceholderRow(
        owner,
        programId,
        rowId,
        "stretching",
        view.draft_updated_at,
      );
      const rowsRepo = new ProgramRowsRepository(storage);
      const before = await rowsRepo.findById(rowId);
      await expect(
        service.undoTypeMismatchPlaceholderLink(
          owner,
          programId,
          rowId,
          linked.program.draft_updated_at,
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("linkTypeMismatchPlaceholderRow rejects rows missing an approved exercise id on the request", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-guard-u4"),
        "u4@example.com",
      );
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-guard-u4");
      const reqId = id("req-guard-u4");
      const rowId = id("row-guard-u4");
      await service.createProgram(owner, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqId,
        requestedName: "Still open",
        requestedBy: owner,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      await service.addPlaceholderRow(owner, programId, {
        rowId,
        exerciseRequestId: reqId,
        prescriptionType: "stretching",
      });
      await storage.run(
        `UPDATE exercise_requests SET status = 'approved', exercise_id = NULL, updated_at = ? WHERE id = ?`,
        [TS, reqId],
      );
      const view = await service.getProgram(owner, programId);
      const rowsRepo = new ProgramRowsRepository(storage);
      const before = await rowsRepo.findById(rowId);
      await expect(
        service.linkTypeMismatchPlaceholderRow(
          owner,
          programId,
          rowId,
          "stretching",
          view.draft_updated_at,
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("undoTypeMismatchPlaceholderLink rejects stale draft_updated_at and keeps the linked row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-guard-u5"),
        "u5@example.com",
      );
      await seedApprovedExerciseVersion(storage, owner);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [owner, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-guard-u5");
      const reqId = id("req-guard-u5");
      const rowId = id("row-guard-u5");
      await service.createProgram(owner, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqId,
        requestedName: "Quad set",
        requestedBy: owner,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      await service.addPlaceholderRow(owner, programId, {
        rowId,
        exerciseRequestId: reqId,
        prescriptionType: "isometric",
      });
      await storage.run(
        `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ?`,
        [FIXTURE_EXERCISE_ID, TS, reqId],
      );
      const view = await service.getProgram(owner, programId);
      const linked = await service.linkTypeMismatchPlaceholderRow(
        owner,
        programId,
        rowId,
        "stretching",
        view.draft_updated_at,
      );
      const rowsRepo = new ProgramRowsRepository(storage);
      const before = await rowsRepo.findById(rowId);
      await expect(
        service.undoTypeMismatchPlaceholderLink(
          owner,
          programId,
          rowId,
          "1970-01-01T00:00:00.000Z",
        ),
      ).rejects.toMatchObject({ code: "stale_write" });
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
      expect(linked.program.rows[0]?.kind).toBe("exercise");
    } finally {
      storage.close();
    }
  });
});
