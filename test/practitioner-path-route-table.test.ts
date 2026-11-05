import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import {
  PRACTITIONER_PATH_ROUTE_SAMPLES,
  canonicalPractitionerPathRouteCaseKeys,
  practitionerPathRouteSampleKey,
  practitionerPathRouteSampleKeysFromHandlerTables,
} from "./helpers/practitioner-path-route-registry.js";
import { assertNoPractitionerIdInHttpRouteSources } from "./helpers/no-practitioner-id-in-http-path.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PractitionerExercisesRepository } from "../src/storage/repositories/exercise-data.js";
import {
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { exerciseMediaExtraRouteHandlers } from "./helpers/exercise-media-http.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  practitionerPathProbeRequestBody,
  probedPractitionerPathRouteKeys,
} from "./helpers/practitioner-path-route-dispatch-probe.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const PRACT_A = testOpaqueEntityId("path-route-a");
const PRACT_B = testOpaqueEntityId("path-route-b");
const EXERCISE_ID = testOpaqueEntityId("path-route-ex");
const VERSION_ID = testOpaqueEntityId("path-route-ver");

async function seedRoutesFixture(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practB: string,
): Promise<void> {
  await seedExercise(storage, practB, EXERCISE_ID);
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: VERSION_ID,
      exercise_id: EXERCISE_ID,
      status: "approved",
      approved_by: practB,
      approved_at: TS,
      title: "Shared move",
    }),
  ]);
  await new PractitionerExercisesRepository(storage).upsert({
    practitionerId: practB,
    exerciseId: EXERCISE_ID,
    favourite: true,
    savedAt: TS,
    lastUsedAt: null,
  });
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: FIXTURE_VERSION_ID,
      exercise_id: EXERCISE_ID,
      version_number: 2,
      status: "draft",
      title: "Draft for media",
      starting_position: "Supine",
    }),
  ]);
}

function samplePathForSession(
  sample: (typeof PRACTITIONER_PATH_ROUTE_SAMPLES)[number],
): string {
  return sample.samplePath
    .replace("ex-example", EXERCISE_ID)
    .replace("ver-example", FIXTURE_VERSION_ID);
}

describe("HTTP route table (practitioner-scoped session routes)", () => {
  it("pins practitioner-scoped route samples to handler route tables and forbids practitioner id path segments", () => {
    assertNoPractitionerIdInHttpRouteSources();
    const fromSamples = PRACTITIONER_PATH_ROUTE_SAMPLES.map(
      practitionerPathRouteSampleKey,
    ).sort();
    const fromTables = practitionerPathRouteSampleKeysFromHandlerTables();
    const canonical = canonicalPractitionerPathRouteCaseKeys();
    expect(fromSamples).toEqual(fromTables);
    expect(fromSamples).toEqual(canonical);
    expect(fromSamples.length).toBeGreaterThan(0);
    for (const sample of PRACTITIONER_PATH_ROUTE_SAMPLES) {
      expect(sample.samplePath.startsWith("/api/me/"), sample.samplePath).toBe(true);
    }
  });

  it("matches handler route tables to routes handleRequest dispatches", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage, PRACT_A, "a@example.com");
      await seedRoutesFixture(storage, practId);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practId,
          email: "a@example.com",
          displayName: "A",
        },
      });
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
        extraRouteHandlers: exerciseMediaExtraRouteHandlers(),
      };
      const probed = await probedPractitionerPathRouteKeys(
        deps,
        practId,
        EXERCISE_ID,
        FIXTURE_VERSION_ID,
        BASE,
      );
      const canonical = canonicalPractitionerPathRouteCaseKeys(
        practId,
        EXERCISE_ID,
        FIXTURE_VERSION_ID,
      );
      expect(probed).toEqual(canonical);
    } finally {
      storage.close();
    }
  });

  it("returns 404 for legacy practitioner id paths even with a session", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practA = await seedPractitioner(storage, PRACT_A, "a@example.com");
      const practB = await seedPractitioner(storage, PRACT_B, "b@example.com");
      await seedRoutesFixture(storage, practB);

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
        extraRouteHandlers: exerciseMediaExtraRouteHandlers(),
      };

      for (const sample of PRACTITIONER_PATH_ROUTE_SAMPLES) {
        const mePath = samplePathForSession(sample);
        const legacyPath = mePath.replace("/api/me/", `/api/practitioners/${practB}/`);
        const body = practitionerPathProbeRequestBody(mePath, sample.method);
        const url = `${BASE}${legacyPath}`;
        const response = await handleRequest(
          new Request(
            url,
            mutatingAppApiRequestInit(url, {
              method: sample.method,
              headers: body
                ? { cookie, "content-type": "application/json" }
                : { cookie },
              body,
            }),
          ),
          deps,
        );
        expect(response.status, practitionerPathRouteSampleKey(sample)).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "not_found" });
      }
    } finally {
      storage.close();
    }
  });

  it("uses session identity on /api/me routes so practitioner B data is unreachable from session A", async () => {
    expect(PRACTITIONER_PATH_ROUTE_SAMPLES.length).toBeGreaterThan(0);
    expect(
      PRACTITIONER_PATH_ROUTE_SAMPLES.map(practitionerPathRouteSampleKey).sort(),
    ).toEqual(practitionerPathRouteSampleKeysFromHandlerTables());

    const storage = await openMigratedDatabase();
    try {
      const practA = await seedPractitioner(storage, PRACT_A, "a@example.com");
      const practB = await seedPractitioner(storage, PRACT_B, "b@example.com");
      await seedRoutesFixture(storage, practB);

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
        extraRouteHandlers: exerciseMediaExtraRouteHandlers(),
      };

      const listUrl = `${BASE}/api/me/my-exercises`;
      const listResponse = await handleRequest(
        new Request(
          listUrl,
          mutatingAppApiRequestInit(listUrl, { headers: { cookie } }),
        ),
        deps,
      );
      expect(listResponse.status).toBe(200);
      const listBody = (await listResponse.json()) as {
        sections: {
          pinned: { exercise_id: string }[];
          recently_used_and_saved: { exercise_id: string }[];
          new_from_requests: { exercise_id: string }[];
        };
      };
      const listedIds = [
        ...listBody.sections.pinned,
        ...listBody.sections.recently_used_and_saved,
        ...listBody.sections.new_from_requests,
      ].map((item) => item.exercise_id);
      expect(listedIds.includes(EXERCISE_ID)).toBe(false);

      const deleteUrl = `${BASE}/api/me/my-exercises/${EXERCISE_ID}`;
      const deleteResponse = await handleRequest(
        new Request(
          deleteUrl,
          mutatingAppApiRequestInit(deleteUrl, {
            method: "DELETE",
            headers: { cookie, "content-type": "application/json" },
          }),
        ),
        deps,
      );
      expect(deleteResponse.status).toBe(404);

      const row = await storage.first<{ favourite: number }>(
        `SELECT favourite FROM practitioner_exercises
         WHERE practitioner_id = ? AND exercise_id = ? LIMIT 1`,
        [practB, EXERCISE_ID],
      );
      expect(row?.favourite).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("returns 400 when a mutating /api/me exercise-library body includes practitionerId", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practA = await seedPractitioner(storage, PRACT_A, "a@example.com");
      await seedRoutesFixture(storage, practA);
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
        extraRouteHandlers: exerciseMediaExtraRouteHandlers(),
      };
      const path = `/api/me/my-exercises/${EXERCISE_ID}`;
      const url = `${BASE}${path}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              practitionerId: practA,
              text_overrides: { title: "x" },
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid_input",
        message: "invalid_input",
      });
    } finally {
      storage.close();
    }
  });
});
