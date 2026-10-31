import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createWorkerAppDependencies } from "../src/adapters/workers/create-app-dependencies.js";
import { handleRequest } from "../src/http/app.js";
import worker from "../src/entry/worker.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const exerciseId = testOpaqueEntityId("ex-1");
const WORKER_PRACTITIONER_ID = testOpaqueEntityId("worker-exercise-library");

function exerciseRouteCases(
  practitionerId: string,
): { method: string; path: string; body?: string }[] {
  const apiBase = `https://example.workers.dev/api/practitioners/${practitionerId}`;
  return [
    { method: "GET", path: `${apiBase}/exercises/approved/search` },
    { method: "GET", path: `${apiBase}/exercises/${exerciseId}` },
    { method: "GET", path: `${apiBase}/my-exercises` },
    {
      method: "POST",
      path: `${apiBase}/my-exercises/${exerciseId}`,
      body: JSON.stringify({ action: "save" }),
    },
    {
      method: "POST",
      path: `${apiBase}/my-exercises/${exerciseId}`,
      body: JSON.stringify({ action: "pin", pinned: true }),
    },
    {
      method: "POST",
      path: `${apiBase}/my-exercises/${exerciseId}`,
      body: JSON.stringify({
        action: "undo",
        undo: {
          practitioner_id: practitionerId,
          exercise_id: exerciseId,
          snapshot: {
            had_row: false,
            favourite: false,
            saved_at: null,
            last_used_at: null,
            text_overrides_json: "{}",
            param_overrides_json: "{}",
          },
        },
      }),
    },
    {
      method: "PATCH",
      path: `${apiBase}/my-exercises/${exerciseId}`,
      body: JSON.stringify({ text_overrides: {} }),
    },
    { method: "DELETE", path: `${apiBase}/my-exercises/${exerciseId}` },
  ];
}

describe("Worker exercise library routes (integration)", () => {
  it("does not expose an unauthenticated exercise API bypass on the Worker entry", () => {
    const deps = createWorkerAppDependencies({
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    });
    expect("enableUnauthenticatedApi" in deps).toBe(false);
  });

  it("returns 401 for exercise API routes without a session on the Worker entry", async () => {
    for (const testCase of exerciseRouteCases(WORKER_PRACTITIONER_ID)) {
      const response = await worker.fetch(
        new Request(testCase.path, {
          method: testCase.method,
          headers: testCase.body ? { "content-type": "application/json" } : undefined,
          body: testCase.body,
        }),
        {},
      );
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    }
  });

  it("serves exercise library routes with a valid session like dev or test", async () => {
    const storage = await openMigratedDatabase();
    const practId = await seedPractitioner(storage, WORKER_PRACTITIONER_ID);
    const apiBase = `https://example.workers.dev/api/practitioners/${practId}`;
    await seedExercise(storage, practId, exerciseId);
    await storage.run(VERSION_INSERT_SQL, [
      ...versionInsertBindings({
        id: testOpaqueEntityId("ver-ex-1"),
        exercise_id: exerciseId,
        status: "approved",
        approved_by: practId,
        approved_at: TS,
        title: "Heel slide",
      }),
    ]);

    const workerDeps = createWorkerAppDependencies({});
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: practId,
        email: "coach@example.com",
        displayName: "Coach",
      },
    });
    const sessionCookie = auth.createSessionCookieHeader();
    const deps = {
      ...workerDeps,
      sql: storage,
      auth,
      mcp: createPhysioMcpHttpHandler(workerDeps.config),
      objects: new InMemoryObjectStorage(),
    };

    function authedRequest(url: string, init: RequestInit = {}): Request {
      const withCsrf = mutatingAppApiRequestInit(url, init);
      const headers = new Headers(withCsrf.headers);
      headers.set("cookie", sessionCookie);
      return new Request(url, { ...withCsrf, headers });
    }

    const searchResponse = await handleRequest(
      authedRequest(`${apiBase}/exercises/approved/search`),
      deps,
    );
    expect(searchResponse.status).toBe(200);
    const searchBody = (await searchResponse.json()) as { exercises: unknown[] };
    expect(searchBody.exercises).toHaveLength(1);

    const detailsResponse = await handleRequest(
      authedRequest(`${apiBase}/exercises/${exerciseId}`),
      deps,
    );
    expect(detailsResponse.status).toBe(200);

    const saveResponse = await handleRequest(
      authedRequest(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "POST",
        body: JSON.stringify({ action: "save" }),
      }),
      deps,
    );
    expect(saveResponse.status).toBe(200);

    const pinResponse = await handleRequest(
      authedRequest(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "POST",
        body: JSON.stringify({ action: "pin", pinned: true }),
      }),
      deps,
    );
    expect(pinResponse.status).toBe(200);
    const pinBody = (await pinResponse.json()) as { undo: unknown };

    const patchResponse = await handleRequest(
      authedRequest(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "PATCH",
        body: JSON.stringify({ text_overrides: { title: "My title" } }),
      }),
      deps,
    );
    expect(patchResponse.status).toBe(200);

    const listResponse = await handleRequest(
      authedRequest(`${apiBase}/my-exercises`),
      deps,
    );
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as { list_state: string };
    expect(listBody.list_state).toBe("ok");

    const undoResponse = await handleRequest(
      authedRequest(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "POST",
        body: JSON.stringify({ action: "undo", undo: pinBody.undo }),
      }),
      deps,
    );
    expect(undoResponse.status).toBe(200);

    const deleteResponse = await handleRequest(
      authedRequest(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "DELETE",
      }),
      deps,
    );
    expect(deleteResponse.status).toBe(200);
  });
});
