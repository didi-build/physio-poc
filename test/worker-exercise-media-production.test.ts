import { afterEach, describe, expect, it, vi } from "vitest";
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
  expectThrownErrorLeakFree,
} from "./helpers/console-log-leak-assertions.js";
import { ImageGenerationError } from "../src/storage/ports/image-generation.js";

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

  it("returns 401 with unauthorized body for media routes without a session on the Worker entry", async () => {
    for (const testCase of exerciseMediaHttpRouteCases()) {
      const response = await worker.fetch(
        new Request(`${WORKER_PRODUCTION_TEST_BASE}${testCase.path}`, {
          method: testCase.method,
          headers:
            testCase.method === "POST"
              ? { "content-type": "application/json" }
              : undefined,
          body:
            testCase.method === "POST" ? JSON.stringify({ scope: "start" }) : undefined,
        }),
        {},
      );
      expect(response.status, `${testCase.method} ${testCase.path}`).toBe(401);
      await expect(response.json()).resolves.toEqual(UNAUTHORIZED_BODY);
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

  it("does not leak PHYSIO_DEEPINFRA_API_KEY in ImageGenerationError or JSON responses", async () => {
    const { storage, d1 } = await openWorkerAuthTestDatabase();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const practId = await seedPractitioner(storage);
      const fetchImpl: typeof fetch = async () =>
        new Response(JSON.stringify({ detail: SENTINEL_API_KEY }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
        PHYSIO_DEEPINFRA_API_KEY: SENTINEL_API_KEY,
      });
      const deps = createWorkerProductionAppDependencies(env);
      const deepinfra = new DeepInfraFluxKleinImageGeneration({
        apiKey: SENTINEL_API_KEY,
        fetchImpl,
      });
      await expectThrownErrorLeakFree(() => deepinfra.generateStartImage("prompt"), {
        apiKey: SENTINEL_API_KEY,
      });
      const err = new ImageGenerationError("image_generation_request_failed", 401);
      (err as ImageGenerationError & { cause: unknown }).cause = new Error(
        `upstream ${SENTINEL_API_KEY.slice(0, 8)}`,
      );
      const body = JSON.stringify({ error: err.code });
      assertLeakFreeText(body, { apiKey: SENTINEL_API_KEY });
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practId,
          email: "coach@example.com",
          displayName: "Coach",
        },
      });
      const wired = {
        ...deps,
        auth,
        exerciseMediaImages: new DeepInfraFluxKleinImageGeneration({
          apiKey: SENTINEL_API_KEY,
          fetchImpl,
        }),
      };
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
      const text = await response.text();
      expect(text).not.toContain(SENTINEL_API_KEY);
      expect(text).not.toContain(SENTINEL_API_KEY.slice(0, 12));
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(SENTINEL_API_KEY),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(SENTINEL_API_KEY),
      );
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      storage.close();
    }
  });
});
