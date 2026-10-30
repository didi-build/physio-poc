import { describe, expect, it } from "vitest";
import { handleExerciseLibraryRequest } from "../src/http/routes/exercise-library.js";
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
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { PractitionerExercisesRepository } from "../src/storage/repositories/exercise-data.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const PRACT_ID = testOpaqueEntityId("ex-lib-null-session");
const EX_ID = "ex-null-session";

type DirectRouteCase = {
  label: string;
  method: string;
  path: string;
  body?: string;
};

const NULL_SESSION_ROUTE_CASES: DirectRouteCase[] = [
  {
    label: "search",
    method: "GET",
    path: `${BASE}/api/practitioners/${PRACT_ID}/exercises/approved/search`,
  },
  {
    label: "details",
    method: "GET",
    path: `${BASE}/api/practitioners/${PRACT_ID}/exercises/${EX_ID}`,
  },
  {
    label: "list",
    method: "GET",
    path: `${BASE}/api/practitioners/${PRACT_ID}/my-exercises`,
  },
  {
    label: "patch my copy",
    method: "PATCH",
    path: `${BASE}/api/practitioners/${PRACT_ID}/my-exercises/${EX_ID}`,
    body: JSON.stringify({ text_overrides: { title: "mine" } }),
  },
  {
    label: "delete",
    method: "DELETE",
    path: `${BASE}/api/practitioners/${PRACT_ID}/my-exercises/${EX_ID}`,
  },
  {
    label: "save",
    method: "POST",
    path: `${BASE}/api/practitioners/${PRACT_ID}/my-exercises/${EX_ID}`,
    body: JSON.stringify({ action: "save" }),
  },
  {
    label: "pin",
    method: "POST",
    path: `${BASE}/api/practitioners/${PRACT_ID}/my-exercises/${EX_ID}`,
    body: JSON.stringify({ action: "pin", pinned: true }),
  },
  {
    label: "undo",
    method: "POST",
    path: `${BASE}/api/practitioners/${PRACT_ID}/my-exercises/${EX_ID}`,
    body: JSON.stringify({
      action: "undo",
      undo: {
        practitioner_id: PRACT_ID,
        exercise_id: EX_ID,
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

describe("handleExerciseLibraryRequest null session (direct, integration)", () => {
  it("returns 401 on each route with null session and performs no writes", async () => {
    const storage = await openMigratedDatabase();
    try {
      await seedPractitioner(storage, PRACT_ID, "coach@example.com");
      await seedExercise(storage, PRACT_ID, EX_ID);
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: `ver-${EX_ID}`,
          exercise_id: EX_ID,
          status: "approved",
          approved_by: PRACT_ID,
          approved_at: TS,
          title: "Move",
        }),
      ]);
      await new PractitionerExercisesRepository(storage).upsert({
        practitionerId: PRACT_ID,
        exerciseId: EX_ID,
        favourite: true,
        savedAt: TS,
        lastUsedAt: null,
      });

      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth: new FakeAuthPort({ practitioner: null }),
        mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      };

      const before = await storage.first<{ c: number }>(
        "SELECT count(*) as c FROM practitioner_exercises",
      );

      for (const testCase of NULL_SESSION_ROUTE_CASES) {
        const response = await handleExerciseLibraryRequest(
          new Request(testCase.path, {
            method: testCase.method,
            headers: testCase.body ? { "content-type": "application/json" } : undefined,
            body: testCase.body,
          }),
          deps,
          { sessionPractitioner: null },
        );
        expect(response, testCase.label).not.toBeNull();
        expect(response!.status, testCase.label).toBe(401);
      }

      const after = await storage.first<{ c: number }>(
        "SELECT count(*) as c FROM practitioner_exercises",
      );
      expect(after?.c).toBe(before?.c);
    } finally {
      storage.close();
    }
  });
});
