import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { createWorkerAppDependencies } from "../src/adapters/workers/create-app-dependencies.js";
import { handleRequest } from "../src/http/app.js";
import worker from "../src/entry/worker.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import {
  PractitionerRoutinesRepository,
  RoutinesRepository,
  RoutineVersionsRepository,
} from "../src/storage/repositories/routines.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  programsCollectionPath,
  programsFromRoutinePath,
  routineSentProgramsPath,
} from "./helpers/program-builder-http-paths.js";
import {
  programBuilderHttpRouteCases,
  programBuilderMutatingHttpRouteCases,
} from "./helpers/program-builder-http-route-cases.js";
import {
  publishRoutine,
  seedTwoPractitioners,
  deleteRoutineRecord,
} from "./helpers/from-routine-http-fixture.js";
import {
  openMigratedDatabase,
  TS,
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
} from "./helpers/exercise-sqlite-fixture.js";

const BASE = "https://physio.test.example";
const WORKER_BASE = "https://example.workers.dev";

const INVALID_INPUT_BODY = {
  error: "invalid_input",
  message: "invalid_input",
} as const;

const PROGRAM_NOT_FOUND_BODY = {
  error: "program_not_found",
  message: "Program not found",
} as const;

const NOT_FOUND_BODY = {
  error: "not_found",
  message: "Not found",
} as const;

const MALFORMED_PERCENT_ROUTINE_SEGMENT = "%E0%A4%A";

async function seedCommunityNewerThanSavedMyCopy(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerA: string,
  practitionerB: string,
): Promise<{ routineId: string; communityHoldS: number; savedCopyHoldS: number }> {
  const v1 = await publishRoutine(storage, practitionerA, {
    routine: "http-source-split-routine",
    draftVersion: "http-source-split-draft",
    row: "http-source-split-row",
    name: "Source split v1",
    hold_s: 20,
  });
  const my = new PractitionerRoutinesRepository(storage);
  await my.saveFrozenCopy({
    id: id("http-source-split-pr"),
    practitionerId: practitionerB,
    routineId: id("http-source-split-routine"),
    sourceRoutineVersionId: v1.id,
    savedAt: TS,
    rows: [
      {
        id: id("http-source-split-pr-row"),
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 20, per_day: { min: 1, max: 2 }, days_per_week: 7 },
      },
    ],
  });
  const versions = new RoutineVersionsRepository(storage);
  await versions.savePublishedVersion({
    id: id("http-source-split-rv2"),
    routineId: id("http-source-split-routine"),
    createdBy: practitionerA,
    createdAt: TS,
    name: "Source split v2",
    copyFromVersionId: v1.id,
  });
  const communityHoldS = 99;
  await storage.run(
    `UPDATE routine_version_rows SET params_json = ? WHERE routine_version_id = ?`,
    [
      JSON.stringify({
        hold_s: communityHoldS,
        per_day: { min: 1, max: 2 },
        days_per_week: 7,
      }),
      id("http-source-split-rv2"),
    ],
  );
  return {
    routineId: id("http-source-split-routine"),
    communityHoldS,
    savedCopyHoldS: 20,
  };
}

function authedRequest(url: string, cookie: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...init, headers });
}

function authedMutatingRequest(
  path: string,
  cookie: string,
  init: RequestInit,
): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
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

function fromRoutineBody(input: {
  programId: string;
  routineId: string;
  source: "my_copy" | "community";
  rowIds: string[];
  extra?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    program_id: input.programId,
    routine_id: input.routineId,
    source: input.source,
    row_ids: input.rowIds,
    ...input.extra,
  });
}

describe("Program from routine HTTP routes (DIDI-1133)", () => {
  it("returns 201 with program view on POST /api/me/programs/from-routine", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "http-comm-routine",
        draftVersion: "http-comm-draft",
        row: "http-comm-row",
        name: "HTTP community knee plan",
        hold_s: 22,
      });
      const programId = id("prog-http-from-routine");
      const rowId = id("prog-http-from-row");
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: fromRoutineBody({
            programId,
            routineId: id("http-comm-routine"),
            source: "community",
            rowIds: [rowId],
          }),
        }),
        deps,
      );
      expect(response.status).toBe(201);
      const body = (await response.json()) as { program: { program_id: string } };
      expect(body.program.program_id).toBe(programId);
      expect(body.program).toMatchObject({
        name: "HTTP community knee plan",
        open_share_link: false,
      });
      const record = await new ProgramsRepository(storage).findById(programId);
      expect(record?.published_at).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid from-routine bodies with canonical invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "http-validate-routine",
        draftVersion: "http-validate-draft",
        row: "http-validate-row",
        name: "Validate routine",
      });
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const base = {
        programId: id("prog-validate"),
        routineId: id("http-validate-routine"),
        source: "community" as const,
        rowIds: [id("validate-row")],
      };
      const beforeCount = await programCount(storage, practitionerA);

      const unknownKey = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: fromRoutineBody({ ...base, extra: { extra_field: true } }),
        }),
        deps,
      );
      expect(unknownKey.status).toBe(400);
      await expect(unknownKey.json()).resolves.toEqual(INVALID_INPUT_BODY);

      const badSource = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            program_id: base.programId,
            routine_id: base.routineId,
            source: "library",
            row_ids: base.rowIds,
          }),
        }),
        deps,
      );
      expect(badSource.status).toBe(400);
      await expect(badSource.json()).resolves.toEqual(INVALID_INPUT_BODY);

      const rowMismatch = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: fromRoutineBody({ ...base, rowIds: [] }),
        }),
        deps,
      );
      expect(rowMismatch.status).toBe(400);
      await expect(rowMismatch.json()).resolves.toEqual(INVALID_INPUT_BODY);

      const nestedPractitioner = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            program_id: base.programId,
            routine_id: base.routineId,
            source: "community",
            row_ids: base.rowIds,
            meta: { practitioner_id: testOpaqueEntityId("evil-nested") },
          }),
        }),
        deps,
      );
      expect(nestedPractitioner.status).toBe(400);
      await expect(nestedPractitioner.json()).resolves.toEqual(INVALID_INPUT_BODY);

      const rowIdsString = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            program_id: base.programId,
            routine_id: base.routineId,
            source: "community",
            row_ids: id("validate-row"),
          }),
        }),
        deps,
      );
      expect(rowIdsString.status).toBe(400);
      await expect(rowIdsString.json()).resolves.toEqual(INVALID_INPUT_BODY);

      const rowIdsObject = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            program_id: base.programId,
            routine_id: base.routineId,
            source: "community",
            row_ids: { id: id("validate-row") },
          }),
        }),
        deps,
      );
      expect(rowIdsObject.status).toBe(400);
      await expect(rowIdsObject.json()).resolves.toEqual(INVALID_INPUT_BODY);

      const rowIdsNonStringElement = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            program_id: base.programId,
            routine_id: base.routineId,
            source: "community",
            row_ids: [123],
          }),
        }),
        deps,
      );
      expect(rowIdsNonStringElement.status).toBe(400);
      await expect(rowIdsNonStringElement.json()).resolves.toEqual(INVALID_INPUT_BODY);

      expect(await programCount(storage, practitionerA)).toBe(beforeCount);
    } finally {
      storage.close();
    }
  });

  it("returns identical program_not_found for missing routine and foreign draft-only routine", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const routines = new RoutinesRepository(storage);
      await routines.createDraft({
        id: id("http-draft-only"),
        draftVersionId: id("http-draft-ver"),
        createdBy: practitionerA,
        createdAt: TS,
        bodyRegionId: "br-knee",
      });
      const missingId = id("http-missing-routine");
      const { deps: depsB, cookie: cookieB } = apiDeps(storage, practitionerB);

      for (const routineId of [missingId, id("http-draft-only")]) {
        const create = await handleRequest(
          authedMutatingRequest(programsFromRoutinePath(), cookieB, {
            method: "POST",
            body: fromRoutineBody({
              programId: id("prog-missing-create"),
              routineId,
              source: "community",
              rowIds: [id("row-missing")],
            }),
          }),
          depsB,
        );
        expect(create.status).toBe(404);
        await expect(create.json()).resolves.toEqual(PROGRAM_NOT_FOUND_BODY);

        const sent = await handleRequest(
          authedRequest(`${BASE}${routineSentProgramsPath(routineId)}`, cookieB),
          depsB,
        );
        expect(sent.status).toBe(404);
        await expect(sent.json()).resolves.toEqual(PROGRAM_NOT_FOUND_BODY);
      }
    } finally {
      storage.close();
    }
  });

  it("returns invalid_input for the author own draft routine without creating rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const routines = new RoutinesRepository(storage);
      await routines.createDraft({
        id: id("http-author-draft"),
        draftVersionId: id("http-author-draft-ver"),
        createdBy: practitionerA,
        createdAt: TS,
        bodyRegionId: "br-knee",
      });
      const programId = id("prog-author-draft");
      const rowId = id("row-author-draft");
      const beforePrograms = await programCount(storage, practitionerA);
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: fromRoutineBody({
            programId,
            routineId: id("http-author-draft"),
            source: "community",
            rowIds: [rowId],
          }),
        }),
        deps,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(INVALID_INPUT_BODY);
      expect(await new ProgramsRepository(storage).findById(programId)).toBeNull();
      expect(await new ProgramRowsRepository(storage).findById(rowId)).toBeNull();
      expect(await programCount(storage, practitionerA)).toBe(beforePrograms);

      const sent = await handleRequest(
        authedRequest(
          `${BASE}${routineSentProgramsPath(id("http-author-draft"))}`,
          cookie,
        ),
        deps,
      );
      expect(sent.status).toBe(400);
      await expect(sent.json()).resolves.toEqual(INVALID_INPUT_BODY);
    } finally {
      storage.close();
    }
  });

  it("returns sent_count and codes only for the caller published programs", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      const programs = new ProgramsRepository(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "http-sent-routine",
        draftVersion: "http-sent-draft",
        row: "http-sent-row",
        name: "Sent stats routine",
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-sent-a-first"),
        routineId: id("http-sent-routine"),
        source: "community",
        rowIds: [id("sent-row-a-first")],
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-sent-a-second"),
        routineId: id("http-sent-routine"),
        source: "community",
        rowIds: [id("sent-row-a-second")],
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-sent-a-unpub"),
        routineId: id("http-sent-routine"),
        source: "community",
        rowIds: [id("sent-row-a-unpub")],
      });
      await service.createProgramFromRoutine(practitionerB, {
        programId: id("prog-sent-b"),
        routineId: id("http-sent-routine"),
        source: "community",
        rowIds: [id("sent-row-b")],
      });
      await programs.publish(id("prog-sent-a-first"), "2026-04-01T10:00:00.000Z");
      await programs.publish(id("prog-sent-a-second"), "2026-04-02T10:00:00.000Z");
      await programs.publish(id("prog-sent-b"), "2026-04-03T10:00:00.000Z");

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedRequest(
          `${BASE}${routineSentProgramsPath(id("http-sent-routine"))}`,
          cookie,
        ),
        deps,
      );
      expect(response.status).toBe(200);
      const first = await programs.findById(id("prog-sent-a-first"));
      const second = await programs.findById(id("prog-sent-a-second"));
      await expect(response.json()).resolves.toEqual({
        sent_count: 2,
        codes: [second!.code, first!.code],
      });
    } finally {
      storage.close();
    }
  });

  it("does not publish or create a share link after create from routine", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "http-unpub-routine",
        draftVersion: "http-unpub-draft",
        row: "http-unpub-row",
        name: "Unpublished copy",
      });
      const programId = id("prog-http-unpub");
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: fromRoutineBody({
            programId,
            routineId: id("http-unpub-routine"),
            source: "community",
            rowIds: [id("row-http-unpub")],
          }),
        }),
        deps,
      );
      expect(response.status).toBe(201);
      const view = (await response.json()) as {
        program: { open_share_link: boolean; auto_save_status: { kind: string } };
      };
      expect(view.program.open_share_link).toBe(false);
      expect(view.program.auto_save_status).toEqual({ kind: "not_published_yet" });
      const record = await new ProgramsRepository(storage).findById(programId);
      expect(record?.published_at).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("lists programs by routine version name via GET /api/me/programs?q", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const service = new ProgramBuilderService(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "http-search-routine",
        draftVersion: "http-search-draft",
        row: "http-search-row",
        name: "Zeta HTTP routine search token",
      });
      await service.createProgramFromRoutine(practitionerA, {
        programId: id("prog-http-routine-search"),
        routineId: id("http-search-routine"),
        source: "community",
        rowIds: [id("row-http-routine-search")],
      });
      await service.updateProgramName(
        practitionerA,
        id("prog-http-routine-search"),
        "Renamed away from zeta",
      );
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedRequest(
          `${BASE}${programsCollectionPath("Zeta HTTP routine search token")}`,
          cookie,
        ),
        deps,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { items: { program_id: string }[] };
      expect(body.items.map((item) => item.program_id)).toEqual([
        id("prog-http-routine-search"),
      ]);
    } finally {
      storage.close();
    }
  });

  it("returns 403 on cross-origin POST from-routine and 415 without JSON content type", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "http-csrf-routine",
        draftVersion: "http-csrf-draft",
        row: "http-csrf-row",
        name: "CSRF routine",
      });
      const beforeCount = await programCount(storage, practitionerA);
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const url = `${BASE}${programsFromRoutinePath()}`;
      const body = fromRoutineBody({
        programId: id("prog-csrf-from-routine"),
        routineId: id("http-csrf-routine"),
        source: "community",
        rowIds: [id("row-csrf-from-routine")],
      });

      const crossOrigin = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { cookie, origin: "https://evil.example" },
            body,
          }),
        ),
        deps,
      );
      expect(crossOrigin.status).toBe(403);

      const wrongType = await handleRequest(
        new Request(url, {
          method: "POST",
          headers: { cookie, origin: BASE, "content-type": "text/plain" },
          body,
        }),
        deps,
      );
      expect(wrongType.status).toBe(415);
      expect(await programCount(storage, practitionerA)).toBe(beforeCount);
    } finally {
      storage.close();
    }
  });

  it("serves GET sent-programs through the Worker entry with session", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "http-worker-routine",
        draftVersion: "http-worker-draft",
        row: "http-worker-row",
        name: "Worker routine",
      });
      const workerDeps = await createWorkerAppDependencies({});
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitionerA,
          email: "coach@example.com",
          displayName: "Coach",
        },
      });
      const cookie = auth.createSessionCookieHeader();
      const deps = {
        ...workerDeps,
        sql: storage,
        auth,
        mcp: createPhysioMcpHttpHandler(workerDeps.config),
        objects: new InMemoryObjectStorage(),
      };
      const path = routineSentProgramsPath(id("http-worker-routine"));
      const unauthed = await worker.fetch(new Request(`${WORKER_BASE}${path}`), {});
      expect(unauthed.status).toBe(401);

      const authed = await handleRequest(
        authedRequest(`${WORKER_BASE}${path}`, cookie),
        deps,
      );
      expect(authed.status).toBe(200);
      await expect(authed.json()).resolves.toEqual({ sent_count: 0, codes: [] });
    } finally {
      storage.close();
    }
  });

  it("pins DIDI-1133 routes in programBuilderHttpRouteCases test helper list", () => {
    // Test helper only; production routes are if branches in src/http/routes.
    const cases = programBuilderHttpRouteCases();
    expect(cases).toContainEqual({
      method: "POST",
      path: programsFromRoutinePath(),
    });
    expect(
      cases.some(
        (routeCase) =>
          routeCase.method === "GET" && routeCase.path.endsWith("/sent-programs"),
      ),
    ).toBe(true);
  });

  it("pins POST from-routine in programBuilderMutatingHttpRouteCases for CSRF registry", () => {
    expect(programBuilderMutatingHttpRouteCases()).toContainEqual({
      method: "POST",
      path: programsFromRoutinePath(),
    });
  });

  it("returns not_found for non-GET methods on sent-programs without stats in the body", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "http-sent-method-routine",
        draftVersion: "http-sent-method-draft",
        row: "http-sent-method-row",
        name: "Sent method guard routine",
      });
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const path = routineSentProgramsPath(id("http-sent-method-routine"));
      for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
        const response = await handleRequest(
          authedMutatingRequest(path, cookie, {
            method,
            body: method === "DELETE" ? undefined : JSON.stringify({}),
          }),
          deps,
        );
        expect(response.status, method).toBe(404);
        const json = (await response.json()) as Record<string, unknown>;
        expect(json, method).toEqual(NOT_FOUND_BODY);
        expect(json, method).not.toHaveProperty("sent_count");
        expect(json, method).not.toHaveProperty("codes");
      }
    } finally {
      storage.close();
    }
  });

  it("returns program_not_found for malformed percent-encoded routine id on sent-programs", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const missingId = id("http-malformed-sent-missing");
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const malformedPath = `/api/me/routines/${MALFORMED_PERCENT_ROUTINE_SEGMENT}/sent-programs`;
      const malformed = await handleRequest(
        authedRequest(`${BASE}${malformedPath}`, cookie),
        deps,
      );
      const missing = await handleRequest(
        authedRequest(`${BASE}${routineSentProgramsPath(missingId)}`, cookie),
        deps,
      );
      expect(malformed.status).toBe(404);
      expect(missing.status).toBe(404);
      const malformedJson = await malformed.json();
      const missingJson = await missing.json();
      expect(malformedJson).toEqual(missingJson);
      expect(malformedJson).toEqual(PROGRAM_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("community source uses latest community rows when the caller has a saved my_copy", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const { routineId, communityHoldS } = await seedCommunityNewerThanSavedMyCopy(
        storage,
        practitionerA,
        practitionerB,
      );
      const { deps, cookie } = apiDeps(storage, practitionerB);
      const response = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: fromRoutineBody({
            programId: id("prog-b-community-http"),
            routineId,
            source: "community",
            rowIds: [id("row-b-community-http")],
          }),
        }),
        deps,
      );
      expect(response.status).toBe(201);
      const body = (await response.json()) as {
        program: { rows: { params: { hold_s?: number } }[] };
      };
      expect(body.program.rows[0]?.params.hold_s).toBe(communityHoldS);
    } finally {
      storage.close();
    }
  });

  it("my_copy uses B saved copy rows, not the latest community version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const { routineId, savedCopyHoldS } = await seedCommunityNewerThanSavedMyCopy(
        storage,
        practitionerA,
        practitionerB,
      );
      const { deps, cookie } = apiDeps(storage, practitionerB);
      const response = await handleRequest(
        authedMutatingRequest(programsFromRoutinePath(), cookie, {
          method: "POST",
          body: fromRoutineBody({
            programId: id("prog-b-my-copy-http"),
            routineId,
            source: "my_copy",
            rowIds: [id("row-b-my-copy-http")],
          }),
        }),
        deps,
      );
      expect(response.status).toBe(201);
      const body = (await response.json()) as {
        program: { rows: { params: { hold_s?: number } }[] };
      };
      expect(body.program.rows[0]?.params.hold_s).toBe(savedCopyHoldS);
    } finally {
      storage.close();
    }
  });

  it("returns identical program_not_found for deleted routine on sent-programs", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, practitionerA, {
        routine: "http-deleted-routine",
        draftVersion: "http-deleted-draft",
        row: "http-deleted-row",
        name: "Deleted routine",
      });
      await deleteRoutineRecord(storage, "http-deleted-routine");
      const missingId = id("http-missing-sent");
      const { deps, cookie } = apiDeps(storage, practitionerA);

      const deleted = await handleRequest(
        authedRequest(
          `${BASE}${routineSentProgramsPath(id("http-deleted-routine"))}`,
          cookie,
        ),
        deps,
      );
      const missing = await handleRequest(
        authedRequest(`${BASE}${routineSentProgramsPath(missingId)}`, cookie),
        deps,
      );
      expect(deleted.status).toBe(404);
      expect(missing.status).toBe(404);
      const deletedJson = await deleted.json();
      const missingJson = await missing.json();
      expect(deletedJson).toEqual(missingJson);
      expect(deletedJson).toEqual(PROGRAM_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });
});
