import { describe, expect, it } from "vitest";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
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

describe("type-mismatch link and undo service (DIDI-1106)", () => {
  it("links then undoes using server-stored snapshot without client payload", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-tm-round"),
        "tm@example.com",
      );
      await seedApprovedExerciseVersion(storage, owner);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [owner, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-tm-round");
      const reqId = id("req-tm-round");
      const rowId = id("row-tm-round");
      await service.createProgram(owner, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqId,
        requestedName: "Bridge marching",
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
      const before = await service.getProgram(owner, programId);
      const linked = await service.linkTypeMismatchPlaceholderRow(
        owner,
        programId,
        rowId,
        "stretching",
        before.draft_updated_at,
      );
      expect(linked.program.rows.find((r) => r.id === rowId)?.kind).toBe("exercise");
      const reverted = await service.undoTypeMismatchPlaceholderLink(
        owner,
        programId,
        rowId,
        linked.program.draft_updated_at,
      );
      const row = reverted.program.rows.find((r) => r.id === rowId);
      expect(row?.kind).toBe("placeholder");
      expect(row?.placeholder_state).toBe("type_mismatch");
      expect(row?.prescription_type).toBe("isometric");
    } finally {
      storage.close();
    }
  });

  it("refuses undo with stale draft_updated_at", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-tm-stale"),
        "stale2@example.com",
      );
      await seedApprovedExerciseVersion(storage, owner);
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-tm-stale");
      await service.createProgram(owner, { programId });
      await expect(
        service.undoTypeMismatchPlaceholderLink(
          owner,
          programId,
          id("missing-row"),
          "1970-01-01T00:00:00.000Z",
        ),
      ).rejects.toMatchObject({ code: "stale_write" });
    } finally {
      storage.close();
    }
  });
});
