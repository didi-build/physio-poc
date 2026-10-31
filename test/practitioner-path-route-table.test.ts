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
import { discoveredPractitionerPathRouteKeysFromHttpSources } from "./helpers/practitioner-path-route-discovery.js";
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
const PRACT_FOREIGN = testOpaqueEntityId("path-route-foreign");
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

function samplePathForPractitioner(
  sample: (typeof PRACTITIONER_PATH_ROUTE_SAMPLES)[number],
  practitionerId: string,
): string {
  return sample.samplePath
    .replace("11111111-1111-4111-8111-111111111111", practitionerId)
    .replace("ex-example", EXERCISE_ID)
    .replace("ver-example", FIXTURE_VERSION_ID);
}

describe("HTTP route table (practitioner path session binding)", () => {
  it("pins practitioner path route samples to handler route tables and HTTP source discovery", () => {
    const fromSamples = PRACTITIONER_PATH_ROUTE_SAMPLES.map(
      practitionerPathRouteSampleKey,
    ).sort();
    const fromTables = practitionerPathRouteSampleKeysFromHandlerTables();
    const canonical = canonicalPractitionerPathRouteCaseKeys();
    const discovered = discoveredPractitionerPathRouteKeysFromHttpSources();
    expect(fromSamples).toEqual(fromTables);
    expect(fromSamples).toEqual(canonical);
    expect(fromSamples).toEqual(discovered);
    expect(fromSamples.length).toBeGreaterThan(0);
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

  it("returns 403 when session practitioner A targets practitioner B on every practitioner path route", async () => {
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
        const path = samplePathForPractitioner(sample, PRACT_B);
        const body = practitionerPathProbeRequestBody(path, sample.method);
        const url = `${BASE}${path}`;
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
        expect(response.status, practitionerPathRouteSampleKey(sample)).toBe(403);
        await expect(response.json()).resolves.toEqual({ error: "forbidden" });
      }
    } finally {
      storage.close();
    }
  });

  it("returns 403 when session targets an unknown practitioner id on every practitioner path route", async () => {
    expect(PRACTITIONER_PATH_ROUTE_SAMPLES.length).toBeGreaterThan(0);
    expect(
      PRACTITIONER_PATH_ROUTE_SAMPLES.map(practitionerPathRouteSampleKey).sort(),
    ).toEqual(practitionerPathRouteSampleKeysFromHandlerTables());

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

      const probedKeys: string[] = [];
      for (const sample of PRACTITIONER_PATH_ROUTE_SAMPLES) {
        const path = samplePathForPractitioner(sample, PRACT_FOREIGN);
        const body = practitionerPathProbeRequestBody(path, sample.method);
        const url = `${BASE}${path}`;
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
        expect(response.status, practitionerPathRouteSampleKey(sample)).toBe(403);
        await expect(response.json()).resolves.toEqual({ error: "forbidden" });
        probedKeys.push(practitionerPathRouteSampleKey(sample));
      }
      expect(probedKeys.sort()).toEqual(
        PRACTITIONER_PATH_ROUTE_SAMPLES.map(practitionerPathRouteSampleKey).sort(),
      );
    } finally {
      storage.close();
    }
  });
});
