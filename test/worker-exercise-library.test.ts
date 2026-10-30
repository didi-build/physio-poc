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

const practitionerId = "pract-1";
const exerciseId = "ex-1";
const apiBase = `https://example.workers.dev/api/practitioners/${practitionerId}`;

const EXERCISE_ROUTE_CASES: { method: string; path: string; body?: string }[] = [
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

describe("Worker exercise library routes (integration)", () => {
  it("does not enable unauthenticated exercise API on the Worker entry", () => {
    const deps = createWorkerAppDependencies({
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    });
    expect(deps.enableUnauthenticatedApi).not.toBe(true);
  });

  it("returns 401 for exercise API routes without a session on the Worker entry", async () => {
    for (const testCase of EXERCISE_ROUTE_CASES) {
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
    const practId = await seedPractitioner(storage, practitionerId);
    await seedExercise(storage, practId, exerciseId);
    await storage.run(VERSION_INSERT_SQL, [
      ...versionInsertBindings({
        id: "ver-1",
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

    const searchResponse = await handleRequest(
      new Request(`${apiBase}/exercises/approved/search`, {
        headers: { cookie: sessionCookie },
      }),
      deps,
    );
    expect(searchResponse.status).toBe(200);
    const searchBody = (await searchResponse.json()) as { exercises: unknown[] };
    expect(searchBody.exercises).toHaveLength(1);

    const detailsResponse = await handleRequest(
      new Request(`${apiBase}/exercises/${exerciseId}`, {
        headers: { cookie: sessionCookie },
      }),
      deps,
    );
    expect(detailsResponse.status).toBe(200);

    const saveResponse = await handleRequest(
      new Request(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ action: "save" }),
      }),
      deps,
    );
    expect(saveResponse.status).toBe(200);

    const pinResponse = await handleRequest(
      new Request(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ action: "pin", pinned: true }),
      }),
      deps,
    );
    expect(pinResponse.status).toBe(200);
    const pinBody = (await pinResponse.json()) as { undo: unknown };

    const patchResponse = await handleRequest(
      new Request(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "PATCH",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ text_overrides: { title: "My title" } }),
      }),
      deps,
    );
    expect(patchResponse.status).toBe(200);

    const listResponse = await handleRequest(
      new Request(`${apiBase}/my-exercises`, {
        headers: { cookie: sessionCookie },
      }),
      deps,
    );
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as { list_state: string };
    expect(listBody.list_state).toBe("ok");

    const undoResponse = await handleRequest(
      new Request(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ action: "undo", undo: pinBody.undo }),
      }),
      deps,
    );
    expect(undoResponse.status).toBe(200);

    const deleteResponse = await handleRequest(
      new Request(`${apiBase}/my-exercises/${exerciseId}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      }),
      deps,
    );
    expect(deleteResponse.status).toBe(200);
  });
});
