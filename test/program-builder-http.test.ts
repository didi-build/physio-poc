import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import {
  programPath,
  programRestorePath,
  programRowDuplicatePath,
  programRowPath,
  programRowsPath,
  programRowsReorderPath,
  programsCollectionPath,
  programsDeletedListPath,
  PROGRAMS_API_BASE,
  programRowLibraryUpdateApplyPath,
  programRowLibraryUpdateKeepPath,
} from "./helpers/program-builder-http-paths.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
  versionInsertBindings,
  VERSION_INSERT_SQL,
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

async function expectInvalidInputQueryGuardResponse(response: Response): Promise<void> {
  expect(response.status).toBe(400);
  expect(await response.text()).toBe(JSON.stringify(INVALID_INPUT_BODY));
}

function practitionerIdQuerySuffix(otherPractitionerId: string): string {
  return `?practitionerId=${encodeURIComponent(otherPractitionerId)}`;
}

function practitionerUnderscoreIdQuerySuffix(otherPractitionerId: string): string {
  return `?practitioner_id=${encodeURIComponent(otherPractitionerId)}`;
}

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

async function rowIdsInOrder(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
): Promise<string[]> {
  const rows = await storage.all<{ id: string }>(
    "SELECT id FROM program_rows WHERE program_id = ? ORDER BY position ASC",
    [programId],
  );
  return rows.map((row) => row.id);
}

async function snapshotProgramDbState(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
) {
  const programs = new ProgramsRepository(storage);
  const rows = new ProgramRowsRepository(storage);
  return {
    program: await programs.findById(programId),
    rows: await rows.listForProgram(programId),
  };
}

function expectDbStateUnchanged(
  before: Awaited<ReturnType<typeof snapshotProgramDbState>>,
  after: Awaited<ReturnType<typeof snapshotProgramDbState>>,
): void {
  expect(after.program).toEqual(before.program);
  expect(after.rows).toEqual(before.rows);
}

async function seedOpenExerciseRequest(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  requestId: string,
  requestedName: string,
  exerciseId?: string | null,
): Promise<void> {
  const requests = new ExerciseRequestsRepository(storage);
  await requests.insert({
    id: requestId,
    requestedName,
    requestedBy: practitionerId,
    status: "open",
    exerciseId: exerciseId ?? null,
    createdAt: TS,
    updatedAt: TS,
  });
}

function sortedHeaderEntries(response: Response): [string, string][] {
  return [...response.headers.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  );
}

describe("Program builder HTTP routes (integration)", () => {
  it("returns 404 for POST link-approved-placeholders without linking placeholder rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const programId = id("prog-no-link-route");
      const requestId = id("req-link-http");
      const rowId = id("row-ph-unlinked");
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        requestId,
        "Pending squat",
        FIXTURE_EXERCISE_ID,
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addPlaceholderRow(practitionerId, programId, {
        rowId,
        exerciseRequestId: requestId,
        prescriptionType: "stretching",
      });
      const beforeRow = await new ProgramRowsRepository(storage).findById(rowId);
      expect(beforeRow?.exercise_request_id).toBe(requestId);
      expect(beforeRow?.exercise_id).toBeNull();

      const { deps, cookie } = apiDeps(storage, practitionerId);
      const url = `${BASE}${PROGRAMS_API_BASE}/link-approved-placeholders`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
              exercise_request_id: requestId,
              approved_version_id: FIXTURE_VERSION_ID,
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(404);
      const afterRow = await new ProgramRowsRepository(storage).findById(rowId);
      expect(afterRow?.exercise_request_id).toBe(requestId);
      expect(afterRow?.exercise_id).toBeNull();
      expect(afterRow?.exercise_version_id).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("returns identical invalid_input for POST create when program_id already exists for self or another practitioner", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("prog-dup-b");
      await seedPractitioner(storage, practitionerB, "b@example.com");
      const sharedProgramId = id("prog-shared-id");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, {
        programId: sharedProgramId,
        name: "Owned",
      });
      const beforeA = await snapshotProgramDbState(storage, sharedProgramId);
      const beforeCountB = await programCount(storage, practitionerB);

      const { deps: depsA, cookie: cookieA } = apiDeps(storage, practitionerA);
      const ownDuplicate = await handleRequest(
        new Request(
          `${BASE}${PROGRAMS_API_BASE}`,
          mutatingAppApiRequestInit(`${BASE}${PROGRAMS_API_BASE}`, {
            method: "POST",
            headers: { cookie: cookieA },
            body: JSON.stringify({ program_id: sharedProgramId }),
          }),
        ),
        depsA,
      );
      const { deps: depsB, cookie: cookieB } = apiDeps(storage, practitionerB);
      const foreignDuplicate = await handleRequest(
        new Request(
          `${BASE}${PROGRAMS_API_BASE}`,
          mutatingAppApiRequestInit(`${BASE}${PROGRAMS_API_BASE}`, {
            method: "POST",
            headers: { cookie: cookieB },
            body: JSON.stringify({ program_id: sharedProgramId }),
          }),
        ),
        depsB,
      );

      expect(ownDuplicate.status).toBe(400);
      expect(foreignDuplicate.status).toBe(400);
      expect(await foreignDuplicate.clone().text()).toBe(
        await ownDuplicate.clone().text(),
      );
      expect(sortedHeaderEntries(foreignDuplicate)).toEqual(
        sortedHeaderEntries(ownDuplicate),
      );
      const ownBody = await ownDuplicate.json();
      const foreignBody = await foreignDuplicate.json();
      expect(foreignBody).toEqual(ownBody);
      expect(ownBody).toEqual(INVALID_INPUT_BODY);
      expectDbStateUnchanged(
        beforeA,
        await snapshotProgramDbState(storage, sharedProgramId),
      );
      expect(await programCount(storage, practitionerB)).toBe(beforeCountB);
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId and practitioner_id query on program list, deleted list, GET program, and PATCH program without changing B storage", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("prog-query-b");
      await seedPractitioner(storage, practitionerB, "b-query@example.com");
      const programA = id("prog-query-a");
      const programB = id("prog-query-b-owned");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, {
        programId: programA,
        name: "Program A",
      });
      await service.createProgram(practitionerB, {
        programId: programB,
        name: "Program B secret",
      });

      const querySuffixBuilders = [
        practitionerIdQuerySuffix,
        practitionerUnderscoreIdQuerySuffix,
      ] as const;

      const { deps, cookie } = apiDeps(storage, practitionerA);

      for (const querySuffix of querySuffixBuilders) {
        const beforeCountB = await programCount(storage, practitionerB);
        const beforeNameB = await storage.first<{ name: string | null }>(
          "SELECT name FROM programs WHERE id = ?",
          [programB],
        );

        const listResponse = await handleRequest(
          authedRequest(
            `${BASE}${programsCollectionPath()}${querySuffix(practitionerB)}`,
            cookie,
          ),
          deps,
        );
        expect(listResponse.status).toBe(400);
        expect(await listResponse.json()).toEqual(INVALID_INPUT_BODY);

        const deletedResponse = await handleRequest(
          authedRequest(
            `${BASE}${programsDeletedListPath()}${querySuffix(practitionerB)}`,
            cookie,
          ),
          deps,
        );
        expect(deletedResponse.status).toBe(400);
        expect(await deletedResponse.json()).toEqual(INVALID_INPUT_BODY);

        const getResponse = await handleRequest(
          authedRequest(
            `${BASE}${programPath(programA)}${querySuffix(practitionerB)}`,
            cookie,
          ),
          deps,
        );
        expect(getResponse.status).toBe(400);
        expect(await getResponse.json()).toEqual(INVALID_INPUT_BODY);

        const patchUrl = `${BASE}${programPath(programA)}${querySuffix(practitionerB)}`;
        const patchResponse = await handleRequest(
          new Request(
            patchUrl,
            mutatingAppApiRequestInit(patchUrl, {
              method: "PATCH",
              headers: { cookie },
              body: JSON.stringify({ name: "Renamed by query attack" }),
            }),
          ),
          deps,
        );
        expect(patchResponse.status).toBe(400);
        expect(await patchResponse.json()).toEqual(INVALID_INPUT_BODY);

        expect(await programCount(storage, practitionerB)).toBe(beforeCountB);
        expect(
          await storage.first<{ name: string | null }>(
            "SELECT name FROM programs WHERE id = ?",
            [programB],
          ),
        ).toEqual(beforeNameB);
        expect(
          await storage.first<{ name: string | null }>(
            "SELECT name FROM programs WHERE id = ?",
            [programA],
          ),
        ).toEqual({ name: "Program A" });
      }
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId and practitioner_id query on POST create and POST rows without creating or changing storage for A or B", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("prog-post-query-b");
      await seedPractitioner(storage, practitionerB, "b-post-query@example.com");
      const programA = id("prog-post-query-a");
      const wouldBeProgramId = id("prog-never-from-query");
      const wouldBeRowId = id("row-never-from-query");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, {
        programId: programA,
        name: "Existing A",
      });
      await seedApprovedForBuilder(storage, practitionerA);
      await seedOpenExerciseRequest(
        storage,
        practitionerA,
        id("req-post-query-ph"),
        "Pending lunge",
      );

      const querySuffixes = [
        practitionerIdQuerySuffix(practitionerB),
        practitionerUnderscoreIdQuerySuffix(practitionerB),
      ] as const;

      const { deps, cookie } = apiDeps(storage, practitionerA);

      for (const querySuffix of querySuffixes) {
        const beforeCountA = await programCount(storage, practitionerA);
        const beforeCountB = await programCount(storage, practitionerB);
        const beforeRowsA = await programRowCount(storage, programA);
        const beforeNameA = await storage.first<{ name: string | null }>(
          "SELECT name FROM programs WHERE id = ?",
          [programA],
        );

        const createUrl = `${BASE}${PROGRAMS_API_BASE}${querySuffix}`;
        const createResponse = await handleRequest(
          new Request(
            createUrl,
            mutatingAppApiRequestInit(createUrl, {
              method: "POST",
              headers: { cookie },
              body: JSON.stringify({
                program_id: wouldBeProgramId,
                name: "Created via query",
              }),
            }),
          ),
          deps,
        );
        await expectInvalidInputQueryGuardResponse(createResponse);

        const addRowUrl = `${BASE}${programRowsPath(programA)}${querySuffix}`;
        const addRowResponse = await handleRequest(
          new Request(
            addRowUrl,
            mutatingAppApiRequestInit(addRowUrl, {
              method: "POST",
              headers: { cookie },
              body: JSON.stringify({
                row_id: wouldBeRowId,
                exercise_id: FIXTURE_EXERCISE_ID,
              }),
            }),
          ),
          deps,
        );
        await expectInvalidInputQueryGuardResponse(addRowResponse);

        expect(await programCount(storage, practitionerA)).toBe(beforeCountA);
        expect(await programCount(storage, practitionerB)).toBe(beforeCountB);
        expect(await programRowCount(storage, programA)).toBe(beforeRowsA);
        expect(
          await storage.first<{ name: string | null }>(
            "SELECT name FROM programs WHERE id = ?",
            [programA],
          ),
        ).toEqual(beforeNameA);
        expect(
          await new ProgramsRepository(storage).findById(wouldBeProgramId),
        ).toBeNull();
        expect(
          await new ProgramRowsRepository(storage).findById(wouldBeRowId),
        ).toBeNull();
      }
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId and practitioner_id query on DELETE program without deleting", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("prog-del-query-b");
      await seedPractitioner(storage, practitionerB, "b-del-query@example.com");
      const programId = id("prog-del-query-a");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, {
        programId,
        name: "Not deleted",
      });

      const querySuffixes = [
        practitionerIdQuerySuffix(practitionerB),
        practitionerUnderscoreIdQuerySuffix(practitionerB),
      ] as const;

      const { deps, cookie } = apiDeps(storage, practitionerA);

      for (const querySuffix of querySuffixes) {
        const beforeDeletedAt = (
          await new ProgramsRepository(storage).findById(programId)
        )?.deleted_at;

        const deleteUrl = `${BASE}${programPath(programId)}${querySuffix}`;
        const response = await handleRequest(
          new Request(
            deleteUrl,
            mutatingAppApiRequestInit(deleteUrl, {
              method: "DELETE",
              headers: { cookie },
            }),
          ),
          deps,
        );
        await expectInvalidInputQueryGuardResponse(response);

        expect(
          (await new ProgramsRepository(storage).findById(programId))?.deleted_at,
        ).toBe(beforeDeletedAt);
        expect(await programCount(storage, practitionerB)).toBe(0);
      }
    } finally {
      storage.close();
    }
  });

  it("does not reject PractitionerId query spelling (case-sensitive guard keys)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("prog-case-query-b");
      await seedPractitioner(storage, practitionerB, "b-case@example.com");
      const programId = id("prog-case-query-a");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, {
        programId,
        name: "Visible to A only",
      });

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedRequest(
          `${BASE}${programsCollectionPath()}?PractitionerId=${encodeURIComponent(practitionerB)}`,
          cookie,
        ),
        deps,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { items: { program_id: string }[] };
      expect(body.items.map((item) => item.program_id)).toEqual([programId]);
      expect(await programCount(storage, practitionerB)).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("persists row note on PATCH /api/me/programs/:programId/rows/:rowId over HTTP", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const programId = id("prog-patch-note");
      const rowId = id("row-patch-note");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addExerciseRow(practitionerId, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
      });

      const { deps, cookie } = apiDeps(storage, practitionerId);
      const patchUrl = `${BASE}${programRowPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          patchUrl,
          mutatingAppApiRequestInit(patchUrl, {
            method: "PATCH",
            headers: { cookie },
            body: JSON.stringify({ note: "Pinned via HTTP PATCH" }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(200);
      expect((await new ProgramRowsRepository(storage).findById(rowId))?.note).toBe(
        "Pinned via HTTP PATCH",
      );
    } finally {
      storage.close();
    }
  });

  it("persists placeholder row shape on POST /api/me/programs/:programId/rows with exercise_request_id over HTTP", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-post-ph-http");
      const requestId = id("req-post-ph-http");
      const rowId = id("row-post-ph-http");
      await seedOpenExerciseRequest(
        storage,
        practitionerId,
        requestId,
        "Pending bridge",
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });

      const { deps, cookie } = apiDeps(storage, practitionerId);
      const addRowUrl = `${BASE}${programRowsPath(programId)}`;
      const response = await handleRequest(
        new Request(
          addRowUrl,
          mutatingAppApiRequestInit(addRowUrl, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
              row_id: rowId,
              exercise_request_id: requestId,
              prescription_type: "stretching",
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(200);
      const row = await new ProgramRowsRepository(storage).findById(rowId);
      expect(row?.exercise_request_id).toBe(requestId);
      expect(row?.exercise_id).toBeNull();
      expect(row?.exercise_version_id).toBeNull();
    } finally {
      storage.close();
    }
  });

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
      const beforeProgramA = await storage.first<{
        name: string | null;
        deleted_at: string | null;
      }>("SELECT name, deleted_at FROM programs WHERE id = ?", [ownedProgramId]);
      const beforeRowOrderA = await rowIdsInOrder(storage, ownedProgramId);
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
      const afterProgramA = await storage.first<{
        name: string | null;
        deleted_at: string | null;
      }>("SELECT name, deleted_at FROM programs WHERE id = ?", [ownedProgramId]);
      expect(afterProgramA).toEqual(beforeProgramA);
      expect(await rowIdsInOrder(storage, ownedProgramId)).toEqual(beforeRowOrderA);
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

  it("returns 400 invalid_input for a non-UUID program path segment", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const url = `${BASE}${PROGRAMS_API_BASE}/not-a-valid-opaque-id`;
      const response = await handleRequest(authedRequest(url, cookie), deps);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid_input",
        message: "Program id must be a UUID v4 opaque id",
      });
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
      const beforeDeletedAt = (
        await new ProgramsRepository(storage).findById(id("prog-csrf"))
      )?.deleted_at;
      const beforeProgramCount = await programCount(storage, practitionerId);
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
      expect(
        (await new ProgramsRepository(storage).findById(id("prog-csrf")))?.deleted_at,
      ).toBe(beforeDeletedAt);
      expect(await programCount(storage, practitionerId)).toBe(beforeProgramCount);
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

  it("returns expected status and persists each program builder mutation over HTTP", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const emptyList = await handleRequest(
        authedRequest(`${BASE}${programsCollectionPath()}`, cookie),
        deps,
      );
      expect(emptyList.status).toBe(200);
      await expect(emptyList.json()).resolves.toEqual({
        items: [],
        matched_code: null,
      });

      const programId = id("prog-http-success");
      const programIdOther = id("prog-http-search");
      const createUrl = `${BASE}${PROGRAMS_API_BASE}`;
      const created = await handleRequest(
        new Request(
          createUrl,
          mutatingAppApiRequestInit(createUrl, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({ program_id: programId, name: "Plan A" }),
          }),
        ),
        deps,
      );
      expect(created.status).toBe(201);
      expect(await programCount(storage, practitionerId)).toBe(1);

      const createOtherUrl = `${BASE}${PROGRAMS_API_BASE}`;
      await handleRequest(
        new Request(
          createOtherUrl,
          mutatingAppApiRequestInit(createOtherUrl, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
              program_id: programIdOther,
              name: "UniqueBetaName",
            }),
          }),
        ),
        deps,
      );

      const list = await handleRequest(
        authedRequest(`${BASE}${programsCollectionPath()}`, cookie),
        deps,
      );
      expect(list.status).toBe(200);
      const listBody = (await list.json()) as { items: { program_id: string }[] };
      expect(listBody.items.map((item) => item.program_id).sort()).toEqual(
        [programId, programIdOther].sort(),
      );

      const noMatch = await handleRequest(
        authedRequest(`${BASE}${programsCollectionPath("zzzznomatch")}`, cookie),
        deps,
      );
      expect(noMatch.status).toBe(200);
      await expect(noMatch.json()).resolves.toEqual({ items: [], matched_code: null });

      const matched = await handleRequest(
        authedRequest(`${BASE}${programsCollectionPath("UniqueBeta")}`, cookie),
        deps,
      );
      expect(matched.status).toBe(200);
      const matchedBody = (await matched.json()) as { items: { program_id: string }[] };
      expect(matchedBody.items.map((item) => item.program_id)).toEqual([
        programIdOther,
      ]);

      const getOne = await handleRequest(
        authedRequest(`${BASE}${programPath(programId)}`, cookie),
        deps,
      );
      expect(getOne.status).toBe(200);

      const patchUrl = `${BASE}${programPath(programId)}`;
      const patched = await handleRequest(
        new Request(
          patchUrl,
          mutatingAppApiRequestInit(patchUrl, {
            method: "PATCH",
            headers: { cookie },
            body: JSON.stringify({ name: "Renamed plan" }),
          }),
        ),
        deps,
      );
      expect(patched.status).toBe(200);
      expect((await new ProgramsRepository(storage).findById(programId))?.name).toBe(
        "Renamed plan",
      );

      const rowA = id("row-http-a");
      const rowB = id("row-http-b");
      const addRowUrl = `${BASE}${programRowsPath(programId)}`;
      for (const rowId of [rowA, rowB]) {
        const added = await handleRequest(
          new Request(
            addRowUrl,
            mutatingAppApiRequestInit(addRowUrl, {
              method: "POST",
              headers: { cookie },
              body: JSON.stringify({
                row_id: rowId,
                exercise_id: FIXTURE_EXERCISE_ID,
              }),
            }),
          ),
          deps,
        );
        expect(added.status).toBe(200);
      }
      expect(await rowIdsInOrder(storage, programId)).toEqual([rowA, rowB]);

      const reorderUrl = `${BASE}${programRowsReorderPath(programId)}`;
      const reordered = await handleRequest(
        new Request(
          reorderUrl,
          mutatingAppApiRequestInit(reorderUrl, {
            method: "PATCH",
            headers: { cookie },
            body: JSON.stringify({ ordered_row_ids: [rowB, rowA] }),
          }),
        ),
        deps,
      );
      expect(reordered.status).toBe(200);
      expect(await rowIdsInOrder(storage, programId)).toEqual([rowB, rowA]);

      const dupNewId = id("row-http-dup");
      const dupUrl = `${BASE}${programRowDuplicatePath(programId, rowA)}`;
      const duplicated = await handleRequest(
        new Request(
          dupUrl,
          mutatingAppApiRequestInit(dupUrl, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({ new_row_id: dupNewId }),
          }),
        ),
        deps,
      );
      expect(duplicated.status).toBe(200);
      const sourceRow = await new ProgramRowsRepository(storage).findById(rowA);
      const dupRow = await new ProgramRowsRepository(storage).findById(dupNewId);
      expect(dupRow?.exercise_id).toBe(sourceRow?.exercise_id);
      expect(dupRow?.id).toBe(dupNewId);

      const keepProgramId = id("prog-http-keep");
      const keepRowId = id("row-http-keep");
      const createKeepUrl = `${BASE}${PROGRAMS_API_BASE}`;
      await handleRequest(
        new Request(
          createKeepUrl,
          mutatingAppApiRequestInit(createKeepUrl, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({ program_id: keepProgramId }),
          }),
        ),
        deps,
      );
      const addKeepRowUrl = `${BASE}${programRowsPath(keepProgramId)}`;
      await handleRequest(
        new Request(
          addKeepRowUrl,
          mutatingAppApiRequestInit(addKeepRowUrl, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
              row_id: keepRowId,
              exercise_id: FIXTURE_EXERCISE_ID,
            }),
          }),
        ),
        deps,
      );

      const version2Id = id("ver-lib-http");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: version2Id,
          version_number: 2,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
          title: "Heel slide v2",
        }),
      );

      const keepUrl = `${BASE}${programRowLibraryUpdateKeepPath(keepProgramId, keepRowId)}`;
      const kept = await handleRequest(
        new Request(
          keepUrl,
          mutatingAppApiRequestInit(keepUrl, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({}),
          }),
        ),
        deps,
      );
      expect(kept.status).toBe(200);
      expect(
        (await new ProgramRowsRepository(storage).findById(keepRowId))
          ?.exercise_version_id,
      ).toBe(FIXTURE_VERSION_ID);

      const applyRowId = rowB;
      const applyUrl = `${BASE}${programRowLibraryUpdateApplyPath(programId, applyRowId)}`;
      const applied = await handleRequest(
        new Request(
          applyUrl,
          mutatingAppApiRequestInit(applyUrl, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({}),
          }),
        ),
        deps,
      );
      expect(applied.status).toBe(200);
      expect(
        (await new ProgramRowsRepository(storage).findById(applyRowId))
          ?.exercise_version_id,
      ).toBe(version2Id);

      const deleteUrl = `${BASE}${programPath(programIdOther)}`;
      const deleted = await handleRequest(
        new Request(
          deleteUrl,
          mutatingAppApiRequestInit(deleteUrl, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      expect(deleted.status).toBe(200);
      expect(
        (await new ProgramsRepository(storage).findById(programIdOther))?.deleted_at,
      ).not.toBeNull();

      const deletedList = await handleRequest(
        authedRequest(`${BASE}${programsDeletedListPath()}`, cookie),
        deps,
      );
      expect(deletedList.status).toBe(200);
      const deletedBody = (await deletedList.json()) as {
        items: { program_id: string }[];
      };
      expect(deletedBody.items.map((item) => item.program_id)).toContain(
        programIdOther,
      );
    } finally {
      storage.close();
    }
  });
});
