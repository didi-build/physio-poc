import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
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
import {
  programRowLinkTypeMismatchPath,
  programRowUndoTypeMismatchLinkPath,
} from "./helpers/program-builder-http-paths.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { id } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";

function apiDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: practId,
      email: `${practId}@example.com`,
      displayName: "Coach",
    },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      auth,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

describe("type-mismatch link and undo HTTP (DIDI-1106)", () => {
  it("refuses undo forged body and leaves a linked row unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerA = await seedPractitioner(storage, id("ph-a-tm"), "a-tm@example.com");
      const ownerB = await seedPractitioner(storage, id("ph-b-tm"), "b-tm@example.com");
      await seedApprovedExerciseVersion(storage, ownerA);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [ownerA, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-undo-forge");
      await service.createProgram(ownerA, { programId });
      const rowId = id("row-linked");
      await service.addExerciseRow(ownerA, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
      });

      const reqOther = id("req-b-forge");
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqOther,
        requestedName: "Forged title",
        requestedBy: ownerB,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });

      const { deps, cookie } = apiDeps(storage, ownerA);
      const rowsBefore = await new ProgramRowsRepository(storage).findById(rowId);
      const url = `${BASE}${programRowUndoTypeMismatchLinkPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              undo: {
                kind: "placeholder_type_mismatch_link",
                row_id: rowId,
                exercise_request_id: reqOther,
                prescription_type: "stretching",
                params: {},
                note: null,
                text_snapshot: { title: "Forged title" },
              },
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("invalid_input");
      const rowsAfter = await new ProgramRowsRepository(storage).findById(rowId);
      expect(rowsAfter).toEqual(rowsBefore);
    } finally {
      storage.close();
    }
  });

  it("refuses stale draft_updated_at on link without writing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-stale"),
        "stale@example.com",
      );
      await seedApprovedExerciseVersion(storage, owner);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [owner, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      const programId = id("prog-stale-link");
      const reqId = id("req-stale");
      const rowId = id("row-stale");
      await service.createProgram(owner, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqId,
        requestedName: "Hold",
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
        `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ?`,
        [FIXTURE_EXERCISE_ID, TS, reqId],
      );
      const view = await service.getProgram(owner, programId);
      const rowsRepo = new ProgramRowsRepository(storage);
      const rowBefore = await rowsRepo.findById(rowId);
      const { deps, cookie } = apiDeps(storage, owner);
      const url = `${BASE}${programRowLinkTypeMismatchPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              prescription_type: "stretching",
              draft_updated_at: "1970-01-01T00:00:00.000Z",
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("stale_write");
      const rowAfter = await rowsRepo.findById(rowId);
      expect(rowAfter?.exercise_request_id).toBe(rowBefore?.exercise_request_id);
      expect(view.draft_updated_at).not.toBe("1970-01-01T00:00:00.000Z");
    } finally {
      storage.close();
    }
  });
});
