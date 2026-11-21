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
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { id } from "./helpers/opaque-test-ids.js";
import { programBuilderHttpRouteCases } from "./helpers/program-builder-http-route-cases.js";
import {
  programRowLinkTypeMismatchPath,
  programRowUndoTypeMismatchLinkPath,
} from "./helpers/program-builder-http-paths.js";

const BASE = "https://physio.test.example";

const PROGRAM_NOT_FOUND_ERROR = "program_not_found";
const PROGRAM_NOT_FOUND_MESSAGE = "Program not found";
const PROGRAM_NOT_FOUND_BODY = {
  error: PROGRAM_NOT_FOUND_ERROR,
  message: PROGRAM_NOT_FOUND_MESSAGE,
} as const;

const EXERCISE_REQUEST_NOT_FOUND_ERROR = "exercise_request_not_found";
const EXERCISE_REQUEST_NOT_FOUND_MESSAGE = "Exercise request not found";
const EXERCISE_REQUEST_NOT_FOUND_BODY = {
  error: EXERCISE_REQUEST_NOT_FOUND_ERROR,
  message: EXERCISE_REQUEST_NOT_FOUND_MESSAGE,
} as const;

const INVALID_INPUT_BODY = {
  error: "invalid_input",
  message: "invalid_input",
} as const;

const STALE_WRITE_BODY = {
  error: "stale_write",
  message: "Stale write",
} as const;

async function expectHttpProgramNotFound(response: Response): Promise<void> {
  expect(response.status).toBe(404);
  const body = (await response.json()) as { error: string; message: string };
  expect(body.error).toBe("program_not_found");
  expect(body.message).toBe("Program not found");
  expect(body.error).toBe(PROGRAM_NOT_FOUND_ERROR);
  expect(body.message).toBe(PROGRAM_NOT_FOUND_MESSAGE);
  expect(body).toEqual(PROGRAM_NOT_FOUND_BODY);
}

async function expectHttpExerciseRequestNotFound(response: Response): Promise<void> {
  expect(response.status).toBe(404);
  const body = (await response.json()) as { error: string; message: string };
  expect(body.error).toBe("exercise_request_not_found");
  expect(body.message).toBe("Exercise request not found");
  expect(body.error).toBe(EXERCISE_REQUEST_NOT_FOUND_ERROR);
  expect(body.message).toBe(EXERCISE_REQUEST_NOT_FOUND_MESSAGE);
  expect(body).toEqual(EXERCISE_REQUEST_NOT_FOUND_BODY);
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

async function seedTypeMismatchRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  owner: string,
  programId: string,
  rowId: string,
  reqId: string,
  prescriptionType: "stretching" | "isometric" = "isometric",
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
    prescriptionType,
  });
  await storage.run(
    `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ?`,
    [FIXTURE_EXERCISE_ID, TS, reqId],
  );
  const view = await service.getProgram(owner, programId);
  return { draftUpdatedAt: view.draft_updated_at };
}

describe("type-mismatch link and undo HTTP (DIDI-1106)", () => {
  it("pins link and undo routes in programBuilderHttpRouteCases", () => {
    const programId = id("prog-route-pin");
    const rowId = id("row-route-pin");
    const cases = programBuilderHttpRouteCases(programId, rowId);
    expect(cases).toContainEqual({
      method: "POST",
      path: programRowLinkTypeMismatchPath(programId, rowId),
    });
    expect(cases).toContainEqual({
      method: "POST",
      path: programRowUndoTypeMismatchLinkPath(programId, rowId),
    });
  });
  it("rejects unexpected keys on link and undo bodies without touching rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-extra"),
        "extra@example.com",
      );
      const programId = id("prog-extra");
      const reqId = id("req-extra");
      const rowId = id("row-extra");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
      );
      const rowsRepo = new ProgramRowsRepository(storage);
      const before = await rowsRepo.findById(rowId);
      const { deps, cookie } = apiDeps(storage, owner);
      const linkUrl = `${BASE}${programRowLinkTypeMismatchPath(programId, rowId)}`;
      const linkResponse = await handleRequest(
        new Request(
          linkUrl,
          mutatingAppApiRequestInit(linkUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              prescription_type: "stretching",
              draft_updated_at: draftUpdatedAt,
              forged: true,
            }),
          }),
        ),
        deps,
      );
      expect(linkResponse.status).toBe(400);
      await expect(linkResponse.json()).resolves.toEqual(INVALID_INPUT_BODY);
      const undoUrl = `${BASE}${programRowUndoTypeMismatchLinkPath(programId, rowId)}`;
      const undoResponse = await handleRequest(
        new Request(
          undoUrl,
          mutatingAppApiRequestInit(undoUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              draft_updated_at: draftUpdatedAt,
              undo: { kind: "forged" },
            }),
          }),
        ),
        deps,
      );
      expect(undoResponse.status).toBe(400);
      await expect(undoResponse.json()).resolves.toEqual(INVALID_INPUT_BODY);
      const after = await rowsRepo.findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

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
      await expect(response.json()).resolves.toEqual(INVALID_INPUT_BODY);
      const rowsAfter = await new ProgramRowsRepository(storage).findById(rowId);
      expect(rowsAfter).toEqual(rowsBefore);
    } finally {
      storage.close();
    }
  });

  it("requires draft_updated_at on undo when the linked row would otherwise revert", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-undo-req"),
        "undo-req@example.com",
      );
      const programId = id("prog-undo-req");
      const reqId = id("req-undo-req");
      const rowId = id("row-undo-req");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
      );
      const service = new ProgramBuilderService(storage);
      const linked = await service.linkTypeMismatchPlaceholderRow(
        owner,
        programId,
        rowId,
        "stretching",
        draftUpdatedAt,
      );
      const rowsRepo = new ProgramRowsRepository(storage);
      const rowBefore = await rowsRepo.findById(rowId);
      const { deps, cookie } = apiDeps(storage, owner);
      const url = `${BASE}${programRowUndoTypeMismatchLinkPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({}),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(INVALID_INPUT_BODY);
      const rowAfter = await rowsRepo.findById(rowId);
      expect(rowAfter).toEqual(rowBefore);
      void linked;
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
      const programId = id("prog-stale-link");
      const reqId = id("req-stale");
      const rowId = id("row-stale");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
      );
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
      await expect(response.json()).resolves.toEqual(STALE_WRITE_BODY);
      const rowAfter = await rowsRepo.findById(rowId);
      expect(rowAfter).toEqual(rowBefore);
      expect(draftUpdatedAt).not.toBe("1970-01-01T00:00:00.000Z");
    } finally {
      storage.close();
    }
  });

  it("refuses stale draft_updated_at on undo HTTP without reverting a linked row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-stale-undo"),
        "stale-undo@example.com",
      );
      const programId = id("prog-stale-undo");
      const reqId = id("req-stale-undo");
      const rowId = id("row-stale-undo");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
      );
      const service = new ProgramBuilderService(storage);
      const linked = await service.linkTypeMismatchPlaceholderRow(
        owner,
        programId,
        rowId,
        "stretching",
        draftUpdatedAt,
      );
      const rowsRepo = new ProgramRowsRepository(storage);
      const rowBefore = await rowsRepo.findById(rowId);
      expect(rowBefore?.exercise_request_id).toBeNull();
      const { deps, cookie } = apiDeps(storage, owner);
      const url = `${BASE}${programRowUndoTypeMismatchLinkPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              draft_updated_at: "1970-01-01T00:00:00.000Z",
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual(STALE_WRITE_BODY);
      const rowAfter = await rowsRepo.findById(rowId);
      expect(rowAfter).toEqual(rowBefore);
      expect(linked.program.draft_updated_at).not.toBe("1970-01-01T00:00:00.000Z");
    } finally {
      storage.close();
    }
  });

  it("links with the prescription_type from the request body", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("ph-body-type"),
        "body-type@example.com",
      );
      const programId = id("prog-body-type");
      const reqId = id("req-body-type");
      const rowId = id("row-body-type");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        owner,
        programId,
        rowId,
        reqId,
        "stretching",
      );
      await storage.run(`UPDATE exercises SET category = ? WHERE id = ?`, [
        "strengthening",
        FIXTURE_EXERCISE_ID,
      ]);
      const { deps, cookie } = apiDeps(storage, owner);
      const url = `${BASE}${programRowLinkTypeMismatchPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              prescription_type: "concentric",
              draft_updated_at: draftUpdatedAt,
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        program: { rows: { id: string; prescription_type: string }[] };
      };
      const linkedRow = result.program.rows.find((entry) => entry.id === rowId);
      expect(linkedRow?.prescription_type).toBe("concentric");
    } finally {
      storage.close();
    }
  });

  it("returns program_not_found for another practitioner's link and undo without changing rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerA = await seedPractitioner(storage, id("ph-xa"), "xa@example.com");
      const ownerB = await seedPractitioner(storage, id("ph-xb"), "xb@example.com");
      const programId = id("prog-cross-tm");
      const reqId = id("req-cross-tm");
      const rowId = id("row-cross-tm");
      const { draftUpdatedAt } = await seedTypeMismatchRow(
        storage,
        ownerA,
        programId,
        rowId,
        reqId,
      );
      const service = new ProgramBuilderService(storage);
      const linked = await service.linkTypeMismatchPlaceholderRow(
        ownerA,
        programId,
        rowId,
        "stretching",
        draftUpdatedAt,
      );
      const rowsRepo = new ProgramRowsRepository(storage);
      const rowBefore = await rowsRepo.findById(rowId);
      const { deps, cookie } = apiDeps(storage, ownerB);

      const linkUrl = `${BASE}${programRowLinkTypeMismatchPath(programId, rowId)}`;
      const linkResponse = await handleRequest(
        new Request(
          linkUrl,
          mutatingAppApiRequestInit(linkUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              prescription_type: "stretching",
              draft_updated_at: linked.program.draft_updated_at,
            }),
          }),
        ),
        deps,
      );
      await expectHttpProgramNotFound(linkResponse);

      const undoUrl = `${BASE}${programRowUndoTypeMismatchLinkPath(programId, rowId)}`;
      const undoResponse = await handleRequest(
        new Request(
          undoUrl,
          mutatingAppApiRequestInit(undoUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              draft_updated_at: linked.program.draft_updated_at,
            }),
          }),
        ),
        deps,
      );
      await expectHttpProgramNotFound(undoResponse);
      const rowAfter = await rowsRepo.findById(rowId);
      expect(rowAfter).toEqual(rowBefore);
    } finally {
      storage.close();
    }
  });

  it("refuses link on a row tied to another practitioner's request with exercise_request_not_found unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerA = await seedPractitioner(
        storage,
        id("ph-iso-a"),
        "iso-a@example.com",
      );
      const ownerB = await seedPractitioner(
        storage,
        id("ph-iso-b"),
        "iso-b@example.com",
      );
      const programId = id("prog-iso");
      const reqB = id("req-b-owned");
      const rowForeign = id("row-foreign-req");
      await seedApprovedExerciseVersion(storage, ownerB);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [ownerB, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(ownerA, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: reqB,
        requestedName: "Other owner draft",
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
        [rowForeign, programId, reqB, JSON.stringify({ title: "Other owner draft" })],
      );
      const view = await service.getProgram(ownerA, programId);
      const rowsRepo = new ProgramRowsRepository(storage);
      const before = await rowsRepo.findById(rowForeign);
      const { deps, cookie } = apiDeps(storage, ownerA);
      const url = `${BASE}${programRowLinkTypeMismatchPath(programId, rowForeign)}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              prescription_type: "stretching",
              draft_updated_at: view.draft_updated_at,
            }),
          }),
        ),
        deps,
      );
      await expectHttpExerciseRequestNotFound(response);
      const after = await rowsRepo.findById(rowForeign);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });
});
