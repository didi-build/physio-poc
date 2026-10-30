import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import {
  programLinkApprovedPlaceholdersPath,
  programPath,
  programRestorePath,
  programRowPath,
  programRowsPath,
  PROGRAMS_API_BASE,
} from "../src/programs-api-paths.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import { ProgramRowsRepository } from "../src/storage/repositories/programs.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { programBuilderHttpRouteCases } from "./helpers/program-builder-http-route-cases.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";

function authedRequest(url: string, cookie: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...init, headers });
}

function apiDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: practId,
      email: "coach@example.com",
      displayName: "Coach",
    },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      auth,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

async function seedApprovedForBuilder(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
): Promise<void> {
  await seedApprovedExerciseVersion(storage, practitionerId);
  await storage.run(
    `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
    [practitionerId, TS, FIXTURE_VERSION_ID],
  );
}

async function openExerciseRequest(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  requestId: string,
  name: string,
): Promise<void> {
  const requests = new ExerciseRequestsRepository(storage);
  await requests.insert({
    id: requestId,
    requestedName: name,
    requestedBy: practitionerId,
    status: "open",
    createdAt: TS,
    updatedAt: TS,
  });
}

async function markRequestApproved(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  requestId: string,
  exerciseId: string,
): Promise<void> {
  await storage.run(
    `UPDATE exercise_requests SET status = 'approved', exercise_id = ?, updated_at = ? WHERE id = ?`,
    [exerciseId, TS, requestId],
  );
}

async function programRowCount(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
): Promise<number> {
  const row = await storage.first<{ c: number }>(
    "SELECT COUNT(*) AS c FROM program_rows WHERE program_id = ?",
    [programId],
  );
  return row?.c ?? 0;
}

describe("Program builder HTTP routes (integration)", () => {
  it("returns 401 without a session for every route in the program builder route table", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps } = apiDeps(storage, practitionerId);
      for (const routeCase of programBuilderHttpRouteCases()) {
        const response = await handleRequest(
          new Request(`${BASE}${routeCase.path}`, { method: routeCase.method }),
          deps,
        );
        expect(response.status, `${routeCase.method} ${routeCase.path}`).toBe(401);
      }
    } finally {
      storage.close();
    }
  });

  it("returns identical 404 program_not_found for a missing program and another practitioner's program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("prog-http-b");
      await seedPractitioner(storage, practitionerB, "b@example.com");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, { programId: id("prog-owned-a") });

      const { deps, cookie } = apiDeps(storage, practitionerB);
      const missing = await handleRequest(
        authedRequest(`${BASE}${programPath(id("prog-missing"))}`, cookie),
        deps,
      );
      const foreign = await handleRequest(
        authedRequest(`${BASE}${programPath(id("prog-owned-a"))}`, cookie),
        deps,
      );
      expect(missing.status).toBe(404);
      expect(foreign.status).toBe(404);
      const missingBody = await missing.json();
      const foreignBody = await foreign.json();
      expect(foreignBody).toEqual(missingBody);
      expect(missingBody).toEqual({
        error: "program_not_found",
        message: "Program not found",
      });
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId at the top level and nested in row bodies with 400 invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-body-guard") });
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const topLevel = await handleRequest(
        authedRequest(`${BASE}${PROGRAMS_API_BASE}`, cookie, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE },
          body: JSON.stringify({
            program_id: id("prog-evil"),
            practitionerId: testOpaqueEntityId("evil"),
          }),
        }),
        deps,
      );
      expect(topLevel.status).toBe(400);
      await expect(topLevel.json()).resolves.toEqual({
        error: "invalid_input",
        message: "invalid_input",
      });

      const nested = await handleRequest(
        authedRequest(`${BASE}${programRowsPath(id("prog-body-guard"))}`, cookie, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE },
          body: JSON.stringify({
            row_id: id("row-nested"),
            exercise_id: FIXTURE_EXERCISE_ID,
            params: { practitioner_id: practitionerId, hold_s: 5 },
          }),
        }),
        deps,
      );
      expect(nested.status).toBe(400);
      await expect(nested.json()).resolves.toEqual({
        error: "invalid_input",
        message: "invalid_input",
      });
      expect(await programRowCount(storage, id("prog-body-guard"))).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("returns 403 on cross-origin PATCH, POST, and DELETE without changing storage", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-csrf") });
      await service.addExerciseRow(practitionerId, id("prog-csrf"), {
        rowId: id("row-csrf"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const beforeName = (await service.getProgram(practitionerId, id("prog-csrf")))
        .name;
      const beforeRows = await programRowCount(storage, id("prog-csrf"));
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const evilOrigin = "https://evil.example";

      const patch = await handleRequest(
        new Request(
          `${BASE}${programPath(id("prog-csrf"))}`,
          mutatingAppApiRequestInit(`${BASE}${programPath(id("prog-csrf"))}`, {
            method: "PATCH",
            headers: { cookie, origin: evilOrigin },
            body: JSON.stringify({ name: "Stolen" }),
          }),
        ),
        deps,
      );
      expect(patch.status).toBe(403);

      const post = await handleRequest(
        new Request(
          `${BASE}${PROGRAMS_API_BASE}`,
          mutatingAppApiRequestInit(`${BASE}${PROGRAMS_API_BASE}`, {
            method: "POST",
            headers: { cookie, origin: evilOrigin },
            body: JSON.stringify({ program_id: id("prog-csrf-evil") }),
          }),
        ),
        deps,
      );
      expect(post.status).toBe(403);

      const del = await handleRequest(
        new Request(
          `${BASE}${programPath(id("prog-csrf"))}`,
          mutatingAppApiRequestInit(`${BASE}${programPath(id("prog-csrf"))}`, {
            method: "DELETE",
            headers: { cookie, origin: evilOrigin },
          }),
        ),
        deps,
      );
      expect(del.status).toBe(403);

      const afterName = (await service.getProgram(practitionerId, id("prog-csrf")))
        .name;
      expect(afterName).toBe(beforeName);
      expect(await programRowCount(storage, id("prog-csrf"))).toBe(beforeRows);
    } finally {
      storage.close();
    }
  });

  it("returns skipped_count on type mismatch when linking approved placeholders", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      await openExerciseRequest(storage, practitionerId, id("req-http-skip"), "Move");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-http-skip") });
      await service.addPlaceholderRow(practitionerId, id("prog-http-skip"), {
        rowId: id("row-http-fit"),
        exerciseRequestId: id("req-http-skip"),
        prescriptionType: "stretching",
      });
      await service.addPlaceholderRow(practitionerId, id("prog-http-skip"), {
        rowId: id("row-http-skip"),
        exerciseRequestId: id("req-http-skip"),
        prescriptionType: "isometric",
      });
      await markRequestApproved(storage, id("req-http-skip"), FIXTURE_EXERCISE_ID);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const response = await handleRequest(
        authedRequest(`${BASE}${programLinkApprovedPlaceholdersPath()}`, cookie, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE },
          body: JSON.stringify({
            exercise_request_id: id("req-http-skip"),
            approved_version_id: FIXTURE_VERSION_ID,
          }),
        }),
        deps,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ skipped_count: 1 });
      const skippedRow = await new ProgramRowsRepository(storage).findById(
        id("row-http-skip"),
      );
      expect(skippedRow?.exercise_request_id).toBe(id("req-http-skip"));
    } finally {
      storage.close();
    }
  });

  it("returns 400 invalid_input for a disallowed dose on PATCH row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-dose") });
      await service.addExerciseRow(practitionerId, id("prog-dose"), {
        rowId: id("row-dose"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const beforeParams = (
        await new ProgramRowsRepository(storage).findById(id("row-dose"))
      )?.params_json;
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const response = await handleRequest(
        authedRequest(
          `${BASE}${programRowPath(id("prog-dose"), id("row-dose"))}`,
          cookie,
          {
            method: "PATCH",
            headers: { "content-type": "application/json", origin: BASE },
            body: JSON.stringify({ params: { reps: 5 } }),
          },
        ),
        deps,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "invalid_input",
        message: "reps is not allowed for prescription type stretching",
      });
      const afterParams = (
        await new ProgramRowsRepository(storage).findById(id("row-dose"))
      )?.params_json;
      expect(afterParams).toBe(beforeParams);
    } finally {
      storage.close();
    }
  });

  it("deletes then restores a program over HTTP", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId: id("prog-restore-http"),
        name: "Restore me",
      });
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const deleted = await handleRequest(
        new Request(
          `${BASE}${programPath(id("prog-restore-http"))}`,
          mutatingAppApiRequestInit(`${BASE}${programPath(id("prog-restore-http"))}`, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      expect(deleted.status).toBe(200);
      const deletedView = (await deleted.json()) as {
        program: { deleted_at: string | null };
      };
      expect(deletedView.program.deleted_at).not.toBeNull();

      const restored = await handleRequest(
        new Request(
          `${BASE}${programRestorePath(id("prog-restore-http"))}`,
          mutatingAppApiRequestInit(
            `${BASE}${programRestorePath(id("prog-restore-http"))}`,
            {
              method: "POST",
              headers: { cookie },
              body: JSON.stringify({}),
            },
          ),
        ),
        deps,
      );
      expect(restored.status).toBe(200);
      const restoredView = (await restored.json()) as {
        program: { deleted_at: string | null };
      };
      expect(restoredView.program.deleted_at).toBeNull();
    } finally {
      storage.close();
    }
  });
});
