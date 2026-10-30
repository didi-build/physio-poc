import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import {
  programPath,
  programRestorePath,
  programRowPath,
  programRowsPath,
  PROGRAMS_API_BASE,
  programRowDuplicatePath,
} from "./helpers/program-builder-http-paths.js";
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
import {
  programBuilderHttpJsonBody,
  programBuilderHttpRouteCases,
  programBuilderMutatingJsonBodyRouteCases,
  programBuilderProgram404ParityRouteCases,
  type ProgramBuilderHttpProbeContext,
  type ProgramBuilderHttpRouteCase,
} from "./helpers/program-builder-http-route-cases.js";
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

async function programCount(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
): Promise<number> {
  const row = await storage.first<{ c: number }>(
    "SELECT COUNT(*) AS c FROM programs WHERE created_by = ? AND deleted_at IS NULL",
    [practitionerId],
  );
  return row?.c ?? 0;
}

type PractitionerIdPlacement = "top" | "nested" | "array";

function injectPractitionerIdField(
  base: Record<string, unknown>,
  placement: PractitionerIdPlacement,
  key: "practitionerId" | "practitioner_id",
  value: string,
): Record<string, unknown> {
  if (placement === "top") {
    return { ...base, [key]: value };
  }
  if (placement === "nested") {
    return { ...base, meta: { [key]: value } };
  }
  return { ...base, items: [{ [key]: value }] };
}

function routeCaseLabel(routeCase: ProgramBuilderHttpRouteCase): string {
  return `${routeCase.method} ${routeCase.path}`;
}

async function sendAuthedRoute(
  deps: ReturnType<typeof apiDeps>["deps"],
  cookie: string,
  routeCase: ProgramBuilderHttpRouteCase,
  body?: string,
): Promise<Response> {
  const url = `${BASE}${routeCase.path}`;
  if (["POST", "PATCH", "DELETE"].includes(routeCase.method)) {
    const headers: Record<string, string> = { cookie };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    return handleRequest(
      new Request(
        url,
        mutatingAppApiRequestInit(url, {
          method: routeCase.method,
          headers,
          body,
        }),
      ),
      deps,
    );
  }
  return handleRequest(authedRequest(url, cookie, { method: routeCase.method }), deps);
}

const INVALID_INPUT_BODY = {
  error: "invalid_input",
  message: "invalid_input",
} as const;

const PROGRAM_NOT_FOUND_BODY = {
  error: "program_not_found",
  message: "Program not found",
} as const;

const PROGRAM_ROW_NOT_FOUND_BODY = {
  error: "program_row_not_found",
  message: "Program row not found",
} as const;

const MALFORMED_PERCENT_PROGRAM_SEGMENT = "%E0%A4%A";
const MALFORMED_PERCENT_ROW_SEGMENT = "%E0%A4%A";

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

  it("returns identical 404 program_not_found for a missing program and another practitioner's program on every program-scoped route", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("prog-http-b");
      await seedPractitioner(storage, practitionerB, "b@example.com");
      const ownedProgramId = id("prog-owned-a");
      const missingProgramId = id("prog-missing");
      const rowId = id("prog-http-row");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, { programId: ownedProgramId });
      await seedApprovedForBuilder(storage, practitionerA);
      await service.addExerciseRow(practitionerA, ownedProgramId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
      });

      const beforeProgramsB = await programCount(storage, practitionerB);
      const beforeRowsOwned = await programRowCount(storage, ownedProgramId);
      const { deps, cookie } = apiDeps(storage, practitionerB);

      const probeCtx: ProgramBuilderHttpProbeContext = {
        createProgramId: id("prog-never"),
        rowId: id("row-never"),
        exerciseId: FIXTURE_EXERCISE_ID,
        orderedRowIds: [rowId],
        duplicateNewRowId: id("row-dup-never"),
      };

      for (const routeCase of programBuilderProgram404ParityRouteCases(
        ownedProgramId,
        rowId,
      )) {
        const missingPath = routeCase.path.replace(
          encodeURIComponent(ownedProgramId),
          encodeURIComponent(missingProgramId),
        );
        const missingCase: ProgramBuilderHttpRouteCase = {
          method: routeCase.method,
          path: missingPath,
        };
        const body = programBuilderHttpJsonBody(routeCase, probeCtx);
        const missingResponse = await sendAuthedRoute(deps, cookie, missingCase, body);
        const foreignResponse = await sendAuthedRoute(deps, cookie, routeCase, body);
        expect(missingResponse.status, routeCaseLabel(routeCase)).toBe(404);
        expect(foreignResponse.status, routeCaseLabel(routeCase)).toBe(404);
        const missingJson = await missingResponse.json();
        const foreignJson = await foreignResponse.json();
        expect(foreignJson).toEqual(missingJson);
        expect(missingJson).toEqual(PROGRAM_NOT_FOUND_BODY);
      }

      expect(await programCount(storage, practitionerB)).toBe(beforeProgramsB);
      expect(await programRowCount(storage, ownedProgramId)).toBe(beforeRowsOwned);
    } finally {
      storage.close();
    }
  });

  it("returns 404 program_row_not_found for a missing row id without changing storage", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const programId = id("prog-missing-row");
      const existingRowId = id("row-exists");
      const missingRowId = id("row-missing");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addExerciseRow(practitionerId, programId, {
        rowId: existingRowId,
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const beforeRows = await programRowCount(storage, programId);
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const rowRoutes: ProgramBuilderHttpRouteCase[] = [
        { method: "PATCH", path: programRowPath(programId, missingRowId) },
        { method: "DELETE", path: programRowPath(programId, missingRowId) },
        {
          method: "POST",
          path: programRowDuplicatePath(programId, missingRowId),
        },
      ];

      for (const routeCase of rowRoutes) {
        const body =
          routeCase.method === "POST"
            ? JSON.stringify({ new_row_id: id("row-dup-probe") })
            : routeCase.method === "PATCH"
              ? JSON.stringify({ note: "n" })
              : undefined;
        const response = await sendAuthedRoute(deps, cookie, routeCase, body);
        expect(response.status, routeCaseLabel(routeCase)).toBe(404);
        await expect(response.json()).resolves.toEqual(PROGRAM_ROW_NOT_FOUND_BODY);
      }

      expect(await programRowCount(storage, programId)).toBe(beforeRows);
    } finally {
      storage.close();
    }
  });

  it("returns program_not_found for malformed percent-encoded program and row path segments", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const badProgramPath = `${PROGRAMS_API_BASE}/${MALFORMED_PERCENT_PROGRAM_SEGMENT}`;
      const programId = id("prog-uri");
      const badRowPath = `${programRowsPath(programId)}/${MALFORMED_PERCENT_ROW_SEGMENT}`;
      const badDuplicatePath = `${programRowsPath(programId)}/${MALFORMED_PERCENT_ROW_SEGMENT}/duplicate`;
      const badLibraryApplyPath = `${programRowsPath(programId)}/${MALFORMED_PERCENT_ROW_SEGMENT}/library-update/apply`;
      const badLibraryKeepPath = `${programRowsPath(programId)}/${MALFORMED_PERCENT_ROW_SEGMENT}/library-update/keep`;

      for (const { method, path, body } of [
        { method: "GET", path: badProgramPath, body: undefined as string | undefined },
        { method: "PATCH", path: badProgramPath, body: JSON.stringify({ name: "n" }) },
        { method: "PATCH", path: badRowPath, body: JSON.stringify({ note: "n" }) },
        {
          method: "POST",
          path: badDuplicatePath,
          body: JSON.stringify({ new_row_id: id("row-dup-uri") }),
        },
        { method: "POST", path: badLibraryApplyPath, body: JSON.stringify({}) },
        { method: "POST", path: badLibraryKeepPath, body: JSON.stringify({}) },
      ]) {
        const url = `${BASE}${path}`;
        const rowScoped =
          path !== badProgramPath ? PROGRAM_ROW_NOT_FOUND_BODY : PROGRAM_NOT_FOUND_BODY;
        if (method === "GET") {
          const response = await handleRequest(
            authedRequest(url, cookie, { method }),
            deps,
          );
          expect(response.status, `${method} ${path}`).toBe(404);
          await expect(response.json()).resolves.toEqual(PROGRAM_NOT_FOUND_BODY);
          continue;
        }
        const response = await handleRequest(
          new Request(
            url,
            mutatingAppApiRequestInit(url, {
              method,
              headers: { cookie, origin: BASE },
              body,
            }),
          ),
          deps,
        );
        expect(response.status, `${method} ${path}`).toBe(404);
        await expect(response.json()).resolves.toEqual(rowScoped);
      }
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId and practitioner_id at top level, nested, and in arrays on every mutating JSON body route", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const programId = id("prog-body-guard");
      const rowId = id("row-body-guard");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addExerciseRow(practitionerId, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const evilId = testOpaqueEntityId("evil-practitioner");
      const beforePrograms = await programCount(storage, practitionerId);
      const beforeRows = await programRowCount(storage, programId);
      const beforeName = (await service.getProgram(practitionerId, programId)).name;
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const probeCtx: ProgramBuilderHttpProbeContext = {
        createProgramId: id("prog-evil"),
        rowId: id("row-evil"),
        exerciseId: FIXTURE_EXERCISE_ID,
        orderedRowIds: [rowId],
        duplicateNewRowId: id("row-dup-evil"),
      };

      const placements: PractitionerIdPlacement[] = ["top", "nested", "array"];
      const keys: ("practitionerId" | "practitioner_id")[] = [
        "practitionerId",
        "practitioner_id",
      ];

      for (const routeCase of programBuilderMutatingJsonBodyRouteCases(
        programId,
        rowId,
      )) {
        const baseBody = JSON.parse(
          programBuilderHttpJsonBody(routeCase, probeCtx),
        ) as Record<string, unknown>;
        for (const placement of placements) {
          for (const key of keys) {
            const body = JSON.stringify(
              injectPractitionerIdField(baseBody, placement, key, evilId),
            );
            const response = await sendAuthedRoute(deps, cookie, routeCase, body);
            expect(
              response.status,
              `${routeCaseLabel(routeCase)} ${placement} ${key}`,
            ).toBe(400);
            await expect(response.json()).resolves.toEqual(INVALID_INPUT_BODY);
          }
        }
      }

      expect(await programCount(storage, practitionerId)).toBe(beforePrograms);
      expect(await programRowCount(storage, programId)).toBe(beforeRows);
      expect((await service.getProgram(practitionerId, programId)).name).toBe(
        beforeName,
      );
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
