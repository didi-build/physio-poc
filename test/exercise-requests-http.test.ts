import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import { handleExerciseRequestsHttpRequest } from "../src/http/routes/exercise-requests.js";
import {
  exerciseRequestApprovePath,
  exerciseRequestDraftPath,
  exerciseRequestPath,
  exerciseRequestsCollectionPath,
  exerciseRequestsInProgressCountPath,
  exerciseRequestsInProgressPath,
  EXERCISE_REQUESTS_API_BASE,
} from "../src/exercise-requests-api-paths.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { ExerciseLibraryService } from "../src/services/exercise-library/exercise-library-service.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
} from "../src/storage/repositories/exercise-data.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { apiMeHttpRouteCases } from "./helpers/api-me-http-route-cases.js";
import {
  EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID,
  exerciseRequestsHttpJsonBody,
  exerciseRequestsHttpRouteCases,
  exerciseRequestsMutatingHttpRouteCases,
} from "./helpers/exercise-requests-http-route-cases.js";
import {
  buildMutatingAppApiRouteSamples,
  MUTATING_APP_API_HANDLER_ROUTE_TABLES,
} from "./helpers/mutating-app-api-route-registry.js";
import {
  expectInvalidInputQueryGuardResponse,
  practitionerIdQuerySuffix,
  practitionerUnderscoreIdQuerySuffix,
} from "./helpers/invalid-input-query-guard.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";
const AFTER_FORM = "2026-10-30T11:00:00.000Z";

function authedRequest(url: string, cookie: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...init, headers });
}

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
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

async function seedDraftingRequestForPractitioner(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  requestedName: string,
): Promise<{ requestId: string; exerciseId: string }> {
  const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
    now: () => AFTER_FORM,
  });
  const created = await service.submitRequest({
    practitionerId,
    requestedName,
    formOpenedAt: FORM_OPENED,
  });
  expect(created.outcome).toBe("created");
  if (created.outcome !== "created") {
    throw new Error("expected created request");
  }
  return { requestId: created.request_id, exerciseId: created.exercise_id! };
}

/** Independent pin: must not reuse `EXERCISE_REQUESTS_HTTP_ROUTE_TABLE` or the helper return value. */
const PINNED_SEVEN_EXERCISE_REQUEST_HTTP_ROUTES = [
  { method: "GET", path: `${EXERCISE_REQUESTS_API_BASE}/similar` },
  { method: "GET", path: exerciseRequestsInProgressPath() },
  { method: "GET", path: exerciseRequestsInProgressCountPath() },
  { method: "POST", path: exerciseRequestsCollectionPath() },
  {
    method: "GET",
    path: exerciseRequestPath(EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID),
  },
  {
    method: "PATCH",
    path: exerciseRequestDraftPath(EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID),
  },
  {
    method: "POST",
    path: exerciseRequestApprovePath(EXERCISE_REQUESTS_HTTP_ROUTE_PINNED_ID),
  },
] as const;

describe("Exercise requests HTTP routes (integration)", () => {
  it("pins the seven exercise request routes as literal method and path pairs", () => {
    expect(PINNED_SEVEN_EXERCISE_REQUEST_HTTP_ROUTES).toHaveLength(7);
    expect(exerciseRequestsHttpRouteCases()).toEqual([
      ...PINNED_SEVEN_EXERCISE_REQUEST_HTTP_ROUTES,
    ]);
  });

  it("returns 401 from the exercise-requests handler when the session is missing", async () => {
    const storage = await openMigratedDatabase();
    try {
      await seedPractitioner(storage);
      const response = await handleExerciseRequestsHttpRequest(
        new Request(`${BASE}${exerciseRequestsCollectionPath()}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requested_name: "Heel slide",
            form_opened_at: FORM_OPENED,
          }),
        }),
        {
          sql: storage,
          objects: new InMemoryObjectStorage(),
          config: MCP_TEST_CONFIG,
          mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
          auth: new FakeAuthPort({
            practitioner: {
              practitionerId: testOpaqueEntityId("handler-401"),
              email: "coach@example.com",
              displayName: "Coach",
            },
          }),
        },
        { sessionPractitioner: null },
      );
      expect(response?.status).toBe(401);
      await expect(response?.json()).resolves.toEqual({ error: "unauthorized" });
    } finally {
      storage.close();
    }
  });

  it("includes all seven exercise request routes in the api/me route table helper", () => {
    const apiMe = apiMeHttpRouteCases();
    for (const routeCase of exerciseRequestsHttpRouteCases()) {
      expect(apiMe).toContainEqual(routeCase);
    }
  });

  it("includes exercise request mutating routes in the CSRF handler registry", () => {
    const samples = buildMutatingAppApiRouteSamples();
    const table = MUTATING_APP_API_HANDLER_ROUTE_TABLES.find(
      (entry) => entry.ruleId === "exercise-requests",
    );
    expect(table).toBeDefined();
    for (const routeCase of exerciseRequestsMutatingHttpRouteCases()) {
      expect(
        samples.some(
          (sample) =>
            sample.ruleId === "exercise-requests" &&
            sample.method === routeCase.method &&
            sample.samplePath === routeCase.path,
        ),
      ).toBe(true);
    }
  });

  it("returns 401 without a session on every exercise request route", async () => {
    const storage = await openMigratedDatabase();
    try {
      await seedPractitioner(storage);
      const { deps } = apiDeps(storage, testOpaqueEntityId("401-pract"));
      for (const routeCase of exerciseRequestsHttpRouteCases()) {
        const body = exerciseRequestsHttpJsonBody(routeCase);
        const url = `${BASE}${routeCase.path}`;
        const init: RequestInit = { method: routeCase.method };
        if (body !== undefined) {
          init.headers = { "content-type": "application/json" };
          init.body = body;
        }
        const response = await handleRequest(new Request(url, init), deps);
        expect(response.status, routeCase.path).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
      }
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId, practitioner_id and as query spoofing on every exercise request route", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("ex-req-spoof-b");
      await seedPractitioner(storage, practitionerB, "spoof-b@example.com");
      const { requestId } = await seedDraftingRequestForPractitioner(
        storage,
        practitionerB,
        "Spoof target draft",
      );
      const { deps, cookie } = apiDeps(storage, practitionerA);

      const querySuffixBuilders = [
        practitionerIdQuerySuffix,
        practitionerUnderscoreIdQuerySuffix,
      ] as const;

      for (const routeCase of exerciseRequestsHttpRouteCases(requestId)) {
        for (const suffixBuilder of querySuffixBuilders) {
          const suffix = suffixBuilder(practitionerB);
          const url = `${BASE}${routeCase.path}${suffix}`;
          let response: Response;
          if (routeCase.method === "GET") {
            response = await handleRequest(authedRequest(url, cookie), deps);
          } else {
            const body = exerciseRequestsHttpJsonBody(routeCase);
            response = await handleRequest(
              authedJsonRequest(`${routeCase.path}${suffix}`, cookie, {
                method: routeCase.method,
                body: body ?? "{}",
              }),
              deps,
            );
          }
          await expectInvalidInputQueryGuardResponse(response);
        }
      }
    } finally {
      storage.close();
    }
  });

  it("POST submit attributes requested_by to session A; body practitionerId rejected with invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("ex-req-http-b");
      await seedPractitioner(storage, practitionerB, "b@example.com");
      const { deps, cookie } = apiDeps(storage, practitionerA);

      const rejected = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Heel slide",
            form_opened_at: FORM_OPENED,
            practitionerId: practitionerB,
          }),
        }),
        deps,
      );
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({
        error: "invalid_input",
        message: "invalid_input",
      });

      const ok = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Heel slide unique name",
            form_opened_at: FORM_OPENED,
          }),
        }),
        deps,
      );
      expect(ok.status).toBe(200);
      const row = await storage.first<{ requested_by: string }>(
        "SELECT requested_by FROM exercise_requests WHERE requested_name = ? LIMIT 1",
        ["Heel slide unique name"],
      );
      expect(row?.requested_by).toBe(practitionerA);
    } finally {
      storage.close();
    }
  });

  it("GET similar, count and item return 200 for session A without query spoofing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("ex-req-get-b");
      await seedPractitioner(storage, practitionerB, "get-b@example.com");
      await seedApprovedExerciseVersion(storage, practitionerA);
      const { requestId } = await seedDraftingRequestForPractitioner(
        storage,
        practitionerB,
        "Shared review draft",
      );
      const { deps, cookie } = apiDeps(storage, practitionerA);

      const similar = await handleRequest(
        authedRequest(`${BASE}${EXERCISE_REQUESTS_API_BASE}/similar?q=Shared`, cookie),
        deps,
      );
      expect(similar.status).toBe(200);

      const count = await handleRequest(
        authedRequest(`${BASE}${exerciseRequestsInProgressCountPath()}`, cookie),
        deps,
      );
      expect(count.status).toBe(200);
      const countBody = (await count.json()) as { in_progress_count: number };
      expect(countBody.in_progress_count).toBeGreaterThanOrEqual(1);

      const item = await handleRequest(
        authedRequest(`${BASE}${exerciseRequestPath(requestId)}`, cookie),
        deps,
      );
      expect(item.status).toBe(200);
      const itemBody = (await item.json()) as { request_id: string };
      expect(itemBody.request_id).toBe(requestId);
    } finally {
      storage.close();
    }
  });

  it("GET in-progress list returns requested_by only, never requester_email", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const requestId = id("ex-req-list-http");
      await new ExerciseRequestsRepository(storage).insert({
        id: requestId,
        requestedName: "Open request",
        requestedBy: practitionerA,
        status: "open",
        exerciseId: null,
        createdAt: TS,
        updatedAt: TS,
      });
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedRequest(`${BASE}${exerciseRequestsInProgressPath()}`, cookie),
        deps,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        requests: Array<Record<string, unknown>>;
      };
      expect(body.requests.length).toBeGreaterThanOrEqual(1);
      for (const item of body.requests) {
        expect(item).not.toHaveProperty("requester_email");
        expect(typeof item.requested_by).toBe("string");
      }
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId query on GET with invalid_input; B request row unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("ex-req-query-b");
      await seedPractitioner(storage, practitionerB, "b-query@example.com");
      const bRequestId = id("ex-req-query-b-row");
      await new ExerciseRequestsRepository(storage).insert({
        id: bRequestId,
        requestedName: "B secret request",
        requestedBy: practitionerB,
        status: "open",
        exerciseId: null,
        createdAt: TS,
        updatedAt: TS,
      });
      const bBefore = await storage.first(
        "SELECT requested_name, requested_by FROM exercise_requests WHERE id = ?",
        [bRequestId],
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      for (const suffix of [
        practitionerIdQuerySuffix(practitionerB),
        practitionerUnderscoreIdQuerySuffix(practitionerB),
      ]) {
        const response = await handleRequest(
          authedRequest(`${BASE}${exerciseRequestsInProgressPath()}${suffix}`, cookie),
          deps,
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: "invalid_input",
          message: "invalid_input",
        });
      }
      expect(
        await storage.first(
          "SELECT requested_name, requested_by FROM exercise_requests WHERE id = ?",
          [bRequestId],
        ),
      ).toEqual(bBefore);
    } finally {
      storage.close();
    }
  });

  it("PATCH draft rejects practitionerId and practitioner_id in body with invalid_input and leaves draft unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("ex-req-patch-b");
      await seedPractitioner(storage, practitionerB, "patch-b@example.com");
      const { requestId, exerciseId } = await seedDraftingRequestForPractitioner(
        storage,
        practitionerB,
        "Patch guard draft",
      );
      const versions = new ExerciseVersionsRepository(storage);
      const beforeDraft = await versions.findDraftForExercise(exerciseId);
      expect(beforeDraft?.title).toBe("Patch guard draft");

      const { deps, cookie } = apiDeps(storage, practitionerA);
      for (const body of [
        { practitionerId: practitionerB, title: "Evil title" },
        { practitioner_id: practitionerB, title: "Evil title" },
      ]) {
        const response = await handleRequest(
          authedJsonRequest(exerciseRequestDraftPath(requestId), cookie, {
            method: "PATCH",
            body: JSON.stringify(body),
          }),
          deps,
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: "invalid_input",
          message: "invalid_input",
        });
      }

      const afterDraft = await versions.findDraftForExercise(exerciseId);
      expect(afterDraft?.title).toBe("Patch guard draft");
    } finally {
      storage.close();
    }
  });

  it("PATCH draft as session A updates B request draft fields", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("ex-req-patch-ok-b");
      await seedPractitioner(storage, practitionerB, "patch-ok-b@example.com");
      const { requestId } = await seedDraftingRequestForPractitioner(
        storage,
        practitionerB,
        "Patch ok draft",
      );
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestDraftPath(requestId), cookie, {
          method: "PATCH",
          body: JSON.stringify({ title: "Edited by approver" }),
        }),
        deps,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { draft: { title: string } | null };
      expect(body.draft?.title).toBe("Edited by approver");
    } finally {
      storage.close();
    }
  });

  it("POST approve rejects body practitionerId with invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("ex-req-appr-body-b");
      await seedPractitioner(storage, practitionerB, "appr-body-b@example.com");
      const { requestId } = await seedDraftingRequestForPractitioner(
        storage,
        practitionerB,
        "Approve body guard",
      );
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestApprovePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({ practitionerId: practitionerB }),
        }),
        deps,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "invalid_input",
        message: "invalid_input",
      });
    } finally {
      storage.close();
    }
  });

  it("POST approve as session A sets approved_by to A and saves My exercises for requester B", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("ex-req-appr-myex-b");
      await seedPractitioner(storage, practitionerB, "appr-myex-b@example.com");
      const { requestId, exerciseId } = await seedDraftingRequestForPractitioner(
        storage,
        practitionerB,
        "Approve my exercises",
      );
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestApprovePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        deps,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        approved_by: string;
        exercise_id: string;
      };
      expect(body.approved_by).toBe(practitionerA);
      expect(body.exercise_id).toBe(exerciseId);

      const library = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const mineB = await library.listMyExercises({ practitionerId: practitionerB });
      expect(
        mineB.sections.new_from_requests.some(
          (item) => item.exercise_id === exerciseId,
        ),
      ).toBe(true);
      const mineA = await library.listMyExercises({ practitionerId: practitionerA });
      expect(
        mineA.sections.new_from_requests.some(
          (item) => item.exercise_id === exerciseId,
        ),
      ).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("returns not_found for POST on the similar route", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedJsonRequest(`${EXERCISE_REQUESTS_API_BASE}/similar`, cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    } finally {
      storage.close();
    }
  });
});
