import { afterEach, describe, expect, it } from "vitest";
import worker from "../src/entry/worker.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createWorkerProductionAppDependencies } from "../src/adapters/workers/create-worker-production-app-dependencies.js";
import { DeepInfraFluxKleinImageGeneration } from "../src/adapters/node/deepinfra-flux-klein-image-generation.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { R2ObjectStorage } from "../src/adapters/workers/r2-object-storage.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import { handleRequest } from "../src/http/app.js";
import { exerciseMediaGeneratePath } from "../src/exercise-media-api-paths.js";
import {
  resetWorkerProductionAuthCacheForTests,
  resetWorkerProductionModuleImportForTests,
} from "../src/adapters/workers/create-app-dependencies.js";
import {
  buildWorkerProductionAuthEnv,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";
import { openWorkerAuthTestDatabase } from "./helpers/worker-auth-d1-fixture.js";
import { createFakeR2Bucket } from "./helpers/fake-r2-bucket.js";
import {
  FIXTURE_VERSION_ID,
  seedExercise,
  seedPractitioner,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { exerciseMediaHttpRouteCases } from "../src/http/routes/exercise-media.js";
import {
  assertLeakFreeText,
  expectConsoleCallsLeakFree,
  expectThrownErrorLeakFree,
  restoreConsoleSpies,
  spyAllConsoleLevels,
} from "./helpers/console-log-leak-assertions.js";
const VERSION_NOT_FOUND_BODY = {
  error: "version_not_found",
  message: "Exercise version not found",
};
const APP_NOT_FOUND_BODY = { error: "not_found" };
const UNAUTHORIZED_BODY = { error: "unauthorized" };
const SENTINEL_API_KEY = "deepinfra-sentinel-key-must-not-appear-in-errors";

afterEach(() => {
  resetWorkerProductionAuthCacheForTests();
  resetWorkerProductionModuleImportForTests();
});

describe("Worker production exercise media (DIDI-1212)", () => {
  it("registers exercise media routes and image port on production deps", async () => {
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });
      const deps = createWorkerProductionAppDependencies(env);
      expect(deps.extraRouteHandlers).toEqual([handleExerciseMediaRequest]);
      expect(deps.exerciseMediaImages).toBeInstanceOf(FakeImageGeneration);
      expect(deps.objects).toBeInstanceOf(R2ObjectStorage);
    } finally {
      storage.close();
    }
  });

  it("builds FakeImageGeneration when PHYSIO_DEEPINFRA_API_KEY is absent on production deps", async () => {
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const deps = createWorkerProductionAppDependencies(
        buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          PHYSIO_MEDIA: createFakeR2Bucket(),
        }),
      );
      expect(deps.exerciseMediaImages).toBeInstanceOf(FakeImageGeneration);
      expect(deps.exerciseMediaImages).not.toBeInstanceOf(
        DeepInfraFluxKleinImageGeneration,
      );
    } finally {
      storage.close();
    }
  });

  it("builds DeepInfraFluxKleinImageGeneration when PHYSIO_DEEPINFRA_API_KEY is set on production deps", async () => {
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const deps = createWorkerProductionAppDependencies(
        buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          PHYSIO_MEDIA: createFakeR2Bucket(),
          PHYSIO_DEEPINFRA_API_KEY: "fixture-non-live-deepinfra-key",
        }),
      );
      expect(deps.exerciseMediaImages).toBeInstanceOf(
        DeepInfraFluxKleinImageGeneration,
      );
    } finally {
      storage.close();
    }
  });

  it("returns 401 with unauthorized body for exercise media on worker.fetch with production auth env and no cookie", async () => {
    const { storage, d1 } = await openWorkerAuthTestDatabase();
    try {
      resetWorkerProductionAuthCacheForTests();
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });
      for (const testCase of exerciseMediaHttpRouteCases()) {
        const response = await worker.fetch(
          new Request(`${WORKER_PRODUCTION_TEST_BASE}${testCase.path}`, {
            method: testCase.method,
            headers:
              testCase.method === "POST"
                ? { "content-type": "application/json" }
                : undefined,
            body:
              testCase.method === "POST"
                ? JSON.stringify({ scope: "start" })
                : undefined,
          }),
          env,
        );
        expect(response.status, `${testCase.method} ${testCase.path}`).toBe(401);
        await expect(response.json()).resolves.toEqual(UNAUTHORIZED_BODY);
      }
    } finally {
      storage.close();
    }
  });

  it("reaches the exercise media handler when authenticated (version_not_found, not app not_found)", async () => {
    const { storage, d1 } = await openWorkerAuthTestDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });
      const deps = createWorkerProductionAppDependencies(env);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practId,
          email: "coach@example.com",
          displayName: "Coach",
        },
      });
      const wired = { ...deps, auth };
      const missingVersionId = testOpaqueEntityId("worker-media-missing");
      const url = `${WORKER_PRODUCTION_TEST_BASE}${exerciseMediaGeneratePath(missingVersionId)}`;
      const init = mutatingAppApiRequestInit(url, {
        method: "POST",
        headers: {
          cookie: auth.createSessionCookieHeader(),
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const response = await handleRequest(new Request(url, init), wired);
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual(VERSION_NOT_FOUND_BODY);
      expect(body).not.toEqual(APP_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("enforces owner-only generate for another practitioner's draft on production Worker deps", async () => {
    const { storage, d1 } = await openWorkerAuthTestDatabase();
    try {
      const practA = await seedPractitioner(
        storage,
        testOpaqueEntityId("wm-a"),
        "a@example.com",
      );
      const practB = await seedPractitioner(
        storage,
        testOpaqueEntityId("wm-b"),
        "b@example.com",
      );
      const exerciseId = await seedExercise(storage, practB);
      const draftVersionId = testOpaqueEntityId("wm-b-draft");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: draftVersionId,
          exercise_id: exerciseId,
          status: "draft",
          title: "Private",
          starting_position: "Supine",
        }),
      ]);
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });
      const deps = createWorkerProductionAppDependencies(env);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practA,
          email: "a@example.com",
          displayName: "A",
        },
      });
      const wired = { ...deps, auth };
      const url = `${WORKER_PRODUCTION_TEST_BASE}${exerciseMediaGeneratePath(draftVersionId)}`;
      const init = mutatingAppApiRequestInit(url, {
        method: "POST",
        headers: {
          cookie: auth.createSessionCookieHeader(),
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const response = await handleRequest(new Request(url, init), wired);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("enforces owner-only internal serve for another practitioner's draft", async () => {
    const { storage, d1 } = await openWorkerAuthTestDatabase();
    try {
      const practA = await seedPractitioner(
        storage,
        testOpaqueEntityId("wm2-a"),
        "a2@example.com",
      );
      const practB = await seedPractitioner(
        storage,
        testOpaqueEntityId("wm2-b"),
        "b2@example.com",
      );
      const exerciseId = await seedExercise(storage, practB);
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: FIXTURE_VERSION_ID,
          exercise_id: exerciseId,
          status: "draft",
          title: "Private",
          starting_position: "Supine",
        }),
      ]);
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });
      const deps = createWorkerProductionAppDependencies(env);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practA,
          email: "a2@example.com",
          displayName: "A2",
        },
      });
      const wired = { ...deps, auth };
      const url = `${WORKER_PRODUCTION_TEST_BASE}/api/exercise-versions/${FIXTURE_VERSION_ID}/media?access=internal`;
      const response = await handleRequest(
        new Request(url, {
          headers: { cookie: auth.createSessionCookieHeader() },
        }),
        wired,
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally {
      storage.close();
    }
  });

  it("enforces owner-only regenerate for another practitioner's draft", async () => {
    const { storage, d1 } = await openWorkerAuthTestDatabase();
    try {
      const practA = await seedPractitioner(
        storage,
        testOpaqueEntityId("wm3-a"),
        "a3@example.com",
      );
      const practB = await seedPractitioner(
        storage,
        testOpaqueEntityId("wm3-b"),
        "b3@example.com",
      );
      const exerciseId = await seedExercise(storage, practB);
      const draftVersionId = testOpaqueEntityId("wm3-b-draft");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: draftVersionId,
          exercise_id: exerciseId,
          status: "draft",
          title: "Private",
          starting_position: "Supine",
        }),
      ]);
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });
      const deps = createWorkerProductionAppDependencies(env);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practA,
          email: "a3@example.com",
          displayName: "A3",
        },
      });
      const wired = { ...deps, auth };
      const url = `${WORKER_PRODUCTION_TEST_BASE}/api/me/exercise-versions/${draftVersionId}/media/regenerate`;
      const init = mutatingAppApiRequestInit(url, {
        method: "POST",
        headers: {
          cookie: auth.createSessionCookieHeader(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ scope: "both", note: null }),
      });
      const response = await handleRequest(new Request(url, init), wired);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("does not leak PHYSIO_DEEPINFRA_API_KEY in console output or the err.cause chain when DeepInfra fetch fails", async () => {
    const consoleSpies = spyAllConsoleLevels();
    try {
      const fetchImpl: typeof fetch = async () =>
        new Response(JSON.stringify({ detail: SENTINEL_API_KEY }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      const deepinfra = new DeepInfraFluxKleinImageGeneration({
        apiKey: SENTINEL_API_KEY,
        fetchImpl,
      });
      let caught: unknown;
      try {
        await deepinfra.generateStartImage("prompt");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeDefined();
      expectThrownErrorLeakFree(caught, { apiKey: SENTINEL_API_KEY });
      const cause = (caught as { cause?: unknown }).cause;
      if (cause !== undefined) {
        expectThrownErrorLeakFree(cause, { apiKey: SENTINEL_API_KEY });
      }
      expectConsoleCallsLeakFree(consoleSpies, { apiKey: SENTINEL_API_KEY });
    } finally {
      restoreConsoleSpies(consoleSpies);
    }
  });

  it("does not leak PHYSIO_DEEPINFRA_API_KEY through Worker port generate when DeepInfra returns 401", async () => {
    let upstreamCalls = 0;
    const originalFetch = globalThis.fetch;
    const upstreamJsonBody = JSON.stringify({
      detail: SENTINEL_API_KEY,
      echo: SENTINEL_API_KEY,
    });
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = typeof input === "string" ? input : input.toString();
      if (!url.includes("deepinfra.com")) {
        return originalFetch(input, init);
      }
      upstreamCalls += 1;
      return new Response(upstreamJsonBody, {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    };

    const consoleSpies = spyAllConsoleLevels();
    try {
      const { storage, d1 } = await openWorkerAuthTestDatabase();
      const practId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practId);
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: FIXTURE_VERSION_ID,
          exercise_id: exerciseId,
          status: "draft",
          title: "Heel slide",
          starting_position: "Supine",
        }),
      ]);

      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
        PHYSIO_DEEPINFRA_API_KEY: SENTINEL_API_KEY,
      });
      const deps = createWorkerProductionAppDependencies(env);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practId,
          email: "coach@example.com",
          displayName: "Coach",
        },
      });
      const wired = { ...deps, auth };
      const url = `${WORKER_PRODUCTION_TEST_BASE}${exerciseMediaGeneratePath(FIXTURE_VERSION_ID)}`;
      const init = mutatingAppApiRequestInit(url, {
        method: "POST",
        headers: {
          cookie: auth.createSessionCookieHeader(),
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const response = await handleRequest(new Request(url, init), wired);
      expect(response.status).toBe(502);
      expect(upstreamCalls).toBeGreaterThanOrEqual(1);
      const text = await response.text();
      expect(text).toContain("image_generation_request_failed");
      assertLeakFreeText(text, {
        apiKey: SENTINEL_API_KEY,
        jsonBody: upstreamJsonBody,
      });
      expectConsoleCallsLeakFree(consoleSpies, {
        apiKey: SENTINEL_API_KEY,
        jsonBody: upstreamJsonBody,
      });
      storage.close();
    } finally {
      restoreConsoleSpies(consoleSpies);
      globalThis.fetch = originalFetch;
    }
  });
});
