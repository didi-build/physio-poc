import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
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
import { PractitionerExercisesRepository } from "../src/storage/repositories/exercise-data.js";

const BASE = "https://physio.test.example";
const PRACT_A = "pract-a";
const PRACT_B = "pract-b";
const EX_B = "ex-b";

type RouteCase = {
  label: string;
  method: string;
  path: (practitionerId: string) => string;
  body?: (ctx: { practA: string; exerciseId: string }) => unknown;
};

const FORBIDDEN_ROUTE_CASES: RouteCase[] = [
  {
    label: "search",
    method: "GET",
    path: (id) => `${BASE}/api/practitioners/${id}/exercises/approved/search`,
  },
  {
    label: "details",
    method: "GET",
    path: (id) => `${BASE}/api/practitioners/${id}/exercises/${EX_B}`,
  },
  {
    label: "list",
    method: "GET",
    path: (id) => `${BASE}/api/practitioners/${id}/my-exercises`,
  },
  {
    label: "save",
    method: "POST",
    path: (id) => `${BASE}/api/practitioners/${id}/my-exercises/${EX_B}`,
    body: () => ({ action: "save" }),
  },
  {
    label: "pin",
    method: "POST",
    path: (id) => `${BASE}/api/practitioners/${id}/my-exercises/${EX_B}`,
    body: () => ({ action: "pin", pinned: true }),
  },
  {
    label: "patch my copy",
    method: "PATCH",
    path: (id) => `${BASE}/api/practitioners/${id}/my-exercises/${EX_B}`,
    body: () => ({ text_overrides: { title: "mine" } }),
  },
  {
    label: "delete",
    method: "DELETE",
    path: (id) => `${BASE}/api/practitioners/${id}/my-exercises/${EX_B}`,
  },
  {
    label: "undo",
    method: "POST",
    path: (id) => `${BASE}/api/practitioners/${id}/my-exercises/${EX_B}`,
    body: ({ practA }) => ({
      action: "undo",
      undo: {
        practitioner_id: practA,
        exercise_id: EX_B,
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
];

async function seedApprovedForPractitioner(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
  exerciseId: string,
): Promise<void> {
  await seedExercise(storage, practId, exerciseId);
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: `ver-${exerciseId}`,
      exercise_id: exerciseId,
      status: "approved",
      approved_by: practId,
      approved_at: TS,
      title: "Shared move",
    }),
  ]);
}

describe("Exercise library practitioner session binding (integration)", () => {
  it("returns 403 when session practitioner A targets practitioner B on each route", async () => {
    const storage = await openMigratedDatabase();
    const practA = await seedPractitioner(storage, PRACT_A, "a@example.com");
    const practB = await seedPractitioner(storage, PRACT_B, "b@example.com");
    await seedApprovedForPractitioner(storage, practB, EX_B);
    await new PractitionerExercisesRepository(storage).upsert({
      practitionerId: practB,
      exerciseId: EX_B,
      favourite: true,
      savedAt: TS,
      lastUsedAt: null,
    });

    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: practA,
        email: "a@example.com",
        displayName: "A",
      },
    });
    const cookie = auth.createSessionCookieHeader();
    const deps = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    };

    for (const testCase of FORBIDDEN_ROUTE_CASES) {
      const body = testCase.body?.({ practA, exerciseId: EX_B });
      const response = await handleRequest(
        new Request(testCase.path(PRACT_B), {
          method: testCase.method,
          headers: body ? { cookie, "content-type": "application/json" } : { cookie },
          body: body ? JSON.stringify(body) : undefined,
        }),
        deps,
      );
      expect(response.status, testCase.label).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    }

    const row = await storage.first<{ favourite: number }>(
      "SELECT favourite FROM practitioner_exercises WHERE practitioner_id = ? AND exercise_id = ? LIMIT 1",
      [practB, EX_B],
    );
    expect(row?.favourite).toBe(1);
  });

  it("allows practitioner A to use routes under their own id", async () => {
    const storage = await openMigratedDatabase();
    const practA = await seedPractitioner(storage, PRACT_A, "a@example.com");
    await seedApprovedForPractitioner(storage, practA, EX_B);

    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: practA,
        email: "a@example.com",
        displayName: "A",
      },
    });
    const cookie = auth.createSessionCookieHeader();
    const deps = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    };
    const apiA = `${BASE}/api/practitioners/${PRACT_A}`;

    expect(
      (
        await handleRequest(
          new Request(`${apiA}/exercises/approved/search`, { headers: { cookie } }),
          deps,
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await handleRequest(
          new Request(`${apiA}/exercises/${EX_B}`, { headers: { cookie } }),
          deps,
        )
      ).status,
    ).toBe(200);

    const save = await handleRequest(
      new Request(`${apiA}/my-exercises/${EX_B}`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ action: "save" }),
      }),
      deps,
    );
    expect(save.status).toBe(200);

    expect(
      (
        await handleRequest(
          new Request(`${apiA}/my-exercises`, { headers: { cookie } }),
          deps,
        )
      ).status,
    ).toBe(200);
  });
});
