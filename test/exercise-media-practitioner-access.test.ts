import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  handleExerciseMediaRequest,
  exerciseMediaHttpRouteCases,
} from "../src/http/routes/exercise-media.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  exerciseMediaExtraRouteHandlers,
  exerciseMediaTestDeps,
} from "./helpers/exercise-media-http.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const MISSING_VERSION_ID = testOpaqueEntityId("media-missing-version");

const VERSION_NOT_FOUND_STATUS = 404;
const VERSION_NOT_FOUND_BODY = {
  error: "version_not_found",
  message: "Exercise version not found",
};

type HttpSnapshot = { status: number; body: unknown };

async function responseSnapshot(response: Response): Promise<HttpSnapshot> {
  return { status: response.status, body: await response.json() };
}

describe("Exercise media cross-practitioner draft access (integration)", () => {
  async function seedPractitionerBDraft(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  ): Promise<{ practA: string; draftVersionId: string }> {
    const practA = await seedPractitioner(
      storage,
      testOpaqueEntityId("media-a"),
      "a@example.com",
    );
    const practB = await seedPractitioner(
      storage,
      testOpaqueEntityId("media-b"),
      "b@example.com",
    );
    const exerciseId = await seedExercise(storage, practB);
    const draftVersionId = testOpaqueEntityId("media-b-draft");
    await storage.run(VERSION_INSERT_SQL, [
      ...versionInsertBindings({
        id: draftVersionId,
        exercise_id: exerciseId,
        status: "draft",
        title: "Private draft",
        starting_position: "Supine",
      }),
    ]);
    return { practA, draftVersionId };
  }

  it("POST generate: practitioner A on B draft matches missing version response", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practA, draftVersionId } = await seedPractitionerBDraft(storage);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId: practA,
        email: "a@example.com",
        displayName: "A",
      });
      const cookie = (deps.auth as FakeAuthPort).createSessionCookieHeader();
      const apiA = `${BASE}/api/practitioners/${practA}`;
      const missingUrl = `${apiA}/exercise-versions/${MISSING_VERSION_ID}/media/generate`;
      const foreignUrl = `${apiA}/exercise-versions/${draftVersionId}/media/generate`;
      const init = (url: string) =>
        mutatingAppApiRequestInit(url, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({}),
        });
      const missing = await responseSnapshot(
        await handleRequest(new Request(missingUrl, init(missingUrl)), deps),
      );
      const foreign = await responseSnapshot(
        await handleRequest(new Request(foreignUrl, init(foreignUrl)), deps),
      );
      expect(missing.status).toBe(VERSION_NOT_FOUND_STATUS);
      expect(missing.body).toEqual(VERSION_NOT_FOUND_BODY);
      expect(foreign).toEqual(missing);
    } finally {
      storage.close();
    }
  });

  it("POST regenerate: practitioner A on B draft matches missing version response", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practA, draftVersionId } = await seedPractitionerBDraft(storage);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId: practA,
        email: "a@example.com",
        displayName: "A",
      });
      const cookie = (deps.auth as FakeAuthPort).createSessionCookieHeader();
      const apiA = `${BASE}/api/practitioners/${practA}`;
      const body = JSON.stringify({ scope: "both", note: null });
      const missingUrl = `${apiA}/exercise-versions/${MISSING_VERSION_ID}/media/regenerate`;
      const foreignUrl = `${apiA}/exercise-versions/${draftVersionId}/media/regenerate`;
      const init = (url: string) =>
        mutatingAppApiRequestInit(url, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body,
        });
      const missing = await responseSnapshot(
        await handleRequest(new Request(missingUrl, init(missingUrl)), deps),
      );
      const foreign = await responseSnapshot(
        await handleRequest(new Request(foreignUrl, init(foreignUrl)), deps),
      );
      expect(missing.status).toBe(VERSION_NOT_FOUND_STATUS);
      expect(missing.body).toEqual(VERSION_NOT_FOUND_BODY);
      expect(foreign).toEqual(missing);
    } finally {
      storage.close();
    }
  });

  it("GET internal serve: practitioner A on B draft matches missing version response", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practA, draftVersionId } = await seedPractitionerBDraft(storage);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId: practA,
        email: "a@example.com",
        displayName: "A",
      });
      const cookie = (deps.auth as FakeAuthPort).createSessionCookieHeader();
      const missing = await responseSnapshot(
        await handleRequest(
          new Request(
            `${BASE}/api/exercise-versions/${MISSING_VERSION_ID}/media?access=internal`,
            { headers: { cookie } },
          ),
          deps,
        ),
      );
      const foreign = await responseSnapshot(
        await handleRequest(
          new Request(
            `${BASE}/api/exercise-versions/${draftVersionId}/media?access=internal`,
            { headers: { cookie } },
          ),
          deps,
        ),
      );
      expect(missing.status).toBe(VERSION_NOT_FOUND_STATUS);
      expect(missing.body).toEqual(VERSION_NOT_FOUND_BODY);
      expect(foreign).toEqual(missing);
    } finally {
      storage.close();
    }
  });
});

describe("Exercise media practitioner auth (integration)", () => {
  it("returns 401 unauthorized from handleRequest without a cookie on each practitioner media path", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practId);
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: FIXTURE_VERSION_ID,
          exercise_id: exerciseId,
          status: "draft",
          title: "Draft",
          starting_position: "Supine",
        }),
      ]);
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth: new FakeAuthPort({
          practitioner: {
            practitionerId: practId,
            email: "coach@example.com",
            displayName: "Coach",
          },
        }),
        mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
        extraRouteHandlers: exerciseMediaExtraRouteHandlers(),
      };

      for (const routeCase of exerciseMediaHttpRouteCases(
        practId,
        FIXTURE_VERSION_ID,
      ).filter((sample) => sample.path.startsWith("/api/practitioners/"))) {
        const response = await handleRequest(
          new Request(`${BASE}${routeCase.path}`, { method: routeCase.method }),
          deps,
        );
        expect(response.status, `${routeCase.method} ${routeCase.path}`).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
      }
    } finally {
      storage.close();
    }
  });

  it("returns 401 unauthorized from handleExerciseMediaRequest without sessionPractitioner on quota, generate and regenerate", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practId);
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: FIXTURE_VERSION_ID,
          exercise_id: exerciseId,
          status: "draft",
          title: "Draft",
          starting_position: "Supine",
        }),
      ]);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId: practId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const base = `/api/practitioners/${practId}`;
      const cases = [
        { method: "GET", path: `${base}/media-regeneration-quota` },
        {
          method: "POST",
          path: `${base}/exercise-versions/${FIXTURE_VERSION_ID}/media/generate`,
          body: JSON.stringify({}),
        },
        {
          method: "POST",
          path: `${base}/exercise-versions/${FIXTURE_VERSION_ID}/media/regenerate`,
          body: JSON.stringify({ scope: "both", note: null }),
        },
      ] as const;

      for (const routeCase of cases) {
        const body = "body" in routeCase ? routeCase.body : undefined;
        const response = await handleExerciseMediaRequest(
          new Request(`http://127.0.0.1${routeCase.path}`, {
            method: routeCase.method,
            headers: body ? { "content-type": "application/json" } : undefined,
            body,
          }),
          deps,
          {},
        );
        expect(response?.status, `${routeCase.method} ${routeCase.path}`).toBe(401);
        await expect(response?.json()).resolves.toEqual({ error: "unauthorized" });
      }
    } finally {
      storage.close();
    }
  });
});
