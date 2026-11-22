import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
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
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { id } from "./helpers/opaque-test-ids.js";
import {
  programRowLinkTypeMismatchPath,
  programRowUndoTypeMismatchLinkPath,
} from "./helpers/program-builder-http-paths.js";
import { TYPE_MISMATCH_BANNER_ONE } from "../src/ui/copy/program-type-mismatch.js";

const BASE = "https://physio.test.example";

const INVALID_INPUT_BODY = {
  error: "invalid_input",
  message: "invalid_input",
} as const;

async function seedTypeMismatchRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  owner: string,
  programId: string,
  rowId: string,
  reqId: string,
): Promise<{ draftUpdatedAt: string }> {
  await seedApprovedExerciseVersion(storage, owner);
  await storage.run(
    `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
    [owner, TS, FIXTURE_VERSION_ID],
  );
  const service = new ProgramBuilderService(storage);
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
    prescriptionType: "stretching",
  });
  await storage.run(
    `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ?`,
    [FIXTURE_EXERCISE_ID, TS, reqId],
  );
  const view = await service.getProgram(owner, programId);
  return { draftUpdatedAt: view.draft_updated_at };
}

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

describe("DIDI-1106 QA R4 program builder (D9, L8, R7, R8, E1)", () => {
  it("D9 lists program card flag when a type_mismatch placeholder exists", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(storage, id("ph-d9"), "d9@example.com");
      const programId = id("prog-d9");
      const rowId = id("row-d9");
      const reqId = id("req-d9");
      await seedTypeMismatchRow(storage, owner, programId, rowId, reqId);
      const service = new ProgramBuilderService(storage);
      const listed = await service.listPrograms(owner);
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0]?.type_mismatch_placeholder_count).toBe(1);
      const flag = TYPE_MISMATCH_BANNER_ONE;
      expect(flag).toBe("1 exercise didn't link");
      expect(listed.items[0]?.type_mismatch_placeholder_count).toBeGreaterThan(0);
    } finally {
      storage.close();
    }
  });

  it("L9 returns undo on type-mismatch link for toast Undo", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(storage, id("ph-l9s"), "l9s@example.com");
      const programId = id("prog-l9s");
      const rowId = id("row-l9s");
      const reqId = id("req-l9s");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
      );
      await storage.run(`UPDATE exercises SET category = ? WHERE id = ?`, [
        "strengthening",
        FIXTURE_EXERCISE_ID,
      ]);
      const service = new ProgramBuilderService(storage);
      const result = await service.linkTypeMismatchPlaceholderRow(
        owner,
        programId,
        rowId,
        "concentric",
        draftUpdatedAt,
      );
      expect(result.undo).toBeDefined();
      expect(result.undo?.kind).toBe("placeholder_type_mismatch_link");
    } finally {
      storage.close();
    }
  });

  it("L8 bumps draft_updated_at on a successful type-mismatch link", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(storage, id("ph-l8"), "l8@example.com");
      const programId = id("prog-l8");
      const rowId = id("row-l8");
      const reqId = id("req-l8");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
      );
      await storage.run(`UPDATE exercises SET category = ? WHERE id = ?`, [
        "strengthening",
        FIXTURE_EXERCISE_ID,
      ]);
      const service = new ProgramBuilderService(storage);
      const result = await service.linkTypeMismatchPlaceholderRow(
        owner,
        programId,
        rowId,
        "concentric",
        draftUpdatedAt,
      );
      expect(result.program.draft_updated_at).not.toBe(draftUpdatedAt);
    } finally {
      storage.close();
    }
  });

  it("R7 rejects a malformed draft_updated_at on type-mismatch link", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(storage, id("ph-r7"), "r7@example.com");
      const programId = id("prog-r7");
      const rowId = id("row-r7");
      const reqId = id("req-r7");
      await seedTypeMismatchRow(storage, owner, programId, rowId, reqId);
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
              draft_updated_at: "",
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(INVALID_INPUT_BODY);
    } finally {
      storage.close();
    }
  });

  it("R8 rejects an undo key on undo-type-mismatch-link", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(storage, id("ph-r8"), "r8@example.com");
      const programId = id("prog-r8");
      const rowId = id("row-r8");
      const reqId = id("req-r8");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
      );
      await storage.run(`UPDATE exercises SET category = ? WHERE id = ?`, [
        "strengthening",
        FIXTURE_EXERCISE_ID,
      ]);
      const service = new ProgramBuilderService(storage);
      const linked = await service.linkTypeMismatchPlaceholderRow(
        owner,
        programId,
        rowId,
        "concentric",
        draftUpdatedAt,
      );
      const { deps, cookie } = apiDeps(storage, owner);
      const undoUrl = `${BASE}${programRowUndoTypeMismatchLinkPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          undoUrl,
          mutatingAppApiRequestInit(undoUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              draft_updated_at: linked.program.draft_updated_at,
              undo: { kind: "forged" },
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(INVALID_INPUT_BODY);
    } finally {
      storage.close();
    }
  });

  it("E1 maps a failed type-mismatch link batch to invalid_input at HTTP", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(storage, id("ph-e1h"), "e1h@example.com");
      const programId = id("prog-e1h");
      const rowId = id("row-e1h");
      const reqId = id("req-e1h");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
      );
      await storage.run(
        `UPDATE exercise_requests SET exercise_id = NULL WHERE id = ?`,
        [reqId],
      );
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
              draft_updated_at: draftUpdatedAt,
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(INVALID_INPUT_BODY);
    } finally {
      storage.close();
    }
  });

  it("E1 maps a failed type-mismatch link batch through mapRowWriteError", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(storage, id("ph-e1"), "e1@example.com");
      const programId = id("prog-e1");
      const rowId = id("row-e1");
      const reqId = id("req-e1");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
      );
      await storage.run(
        `UPDATE exercise_requests SET exercise_id = NULL WHERE id = ?`,
        [reqId],
      );
      const service = new ProgramBuilderService(storage);
      await expect(
        service.linkTypeMismatchPlaceholderRow(
          owner,
          programId,
          rowId,
          "stretching",
          draftUpdatedAt,
        ),
      ).rejects.toBeInstanceOf(ProgramBuilderServiceError);
      await expect(
        service.linkTypeMismatchPlaceholderRow(
          owner,
          programId,
          rowId,
          "stretching",
          draftUpdatedAt,
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });
});
