import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import {
  exerciseRequestsCollectionPath,
  exerciseRequestsInProgressPath,
  EXERCISE_REQUESTS_API_BASE,
} from "../src/exercise-requests-api-paths.js";
import {
  exerciseRequestsHttpRouteCases,
  exerciseRequestsMutatingHttpRouteCases,
} from "../src/http/routes/exercise-requests.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  exerciseRequestsHttpJsonBody,
  exerciseRequestsHttpRouteCases as helperExerciseRequestsHttpRouteCases,
} from "./helpers/exercise-requests-http-route-cases.js";
import {
  practitionerIdQuerySuffix,
  practitionerUnderscoreIdQuerySuffix,
} from "./helpers/invalid-input-query-guard.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

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

describe("Exercise requests HTTP routes (integration)", () => {
  it("pins exerciseRequestsHttpRouteCases in the test helper list", () => {
    expect(helperExerciseRequestsHttpRouteCases()).toEqual(
      exerciseRequestsHttpRouteCases(),
    );
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

  it("pins mutating exercise request routes for CSRF registry", () => {
    const mutating = exerciseRequestsMutatingHttpRouteCases();
    expect(
      mutating.every((routeCase) => ["POST", "PATCH"].includes(routeCase.method)),
    ).toBe(true);
    expect(
      mutating.some((routeCase) => routeCase.path === exerciseRequestsCollectionPath()),
    ).toBe(true);
  });
});
