import { describe, expect, it, vi } from "vitest";
import worker from "../src/entry/worker.js";
import { WORKER_PRODUCTION_AUTH_MISCONFIG_LOG } from "../src/auth/worker-production-auth-config.js";
import { WORKER_MEDIA_BINDING_MISSING_LOG } from "../src/adapters/workers/media-binding-missing-object-storage.js";
import { PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY } from "../src/services/programs/public-share-link-media.js";
import { publicShareLinkMediaApiPath } from "../src/programs-api-paths.js";
import {
  resetWorkerProductionAuthCacheForTests,
  resetWorkerProductionModuleImportForTests,
} from "../src/adapters/workers/create-app-dependencies.js";
import { resetWorkerMediaBindingMissingLogForTests } from "../src/adapters/workers/media-binding-missing-object-storage.js";
import {
  buildWorkerProductionAuthEnv,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";
import {
  d1DatabaseFromSqlite,
  openWorkerAuthTestDatabase,
  seedPractitioner,
} from "./helpers/worker-auth-d1-fixture.js";
import { FIXTURE_VERSION_ID } from "./helpers/exercise-sqlite-fixture.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
const WORKER_BASE = WORKER_PRODUCTION_TEST_BASE;

describe("Worker production PHYSIO_MEDIA binding (DIDI-1040)", () => {
  it("missing PHYSIO_MEDIA keeps auth and non-media routes up; share-link media fails code-only 404", async () => {
    resetWorkerProductionAuthCacheForTests();
    resetWorkerProductionModuleImportForTests();
    resetWorkerMediaBindingMissingLogForTests();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { storage } = await openWorkerAuthTestDatabase();
      try {
        await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
        const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
        const env = buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          PHYSIO_MEDIA: undefined,
        });

        const health = await worker.fetch(new Request(`${WORKER_BASE}/health`), env);
        expect(health.status).toBe(200);

        const signIn = await worker.fetch(
          new Request(`${WORKER_BASE}/api/auth/sign-in/social`, { method: "POST" }),
          env,
        );
        expect(signIn.status).not.toBe(503);

        const media = await worker.fetch(
          new Request(
            `${WORKER_BASE}${publicShareLinkMediaApiPath(
              "not-a-real-token",
              FIXTURE_VERSION_ID,
              "start",
            )}`,
          ),
          env,
        );
        expect(media.status).toBe(404);
        expect(await media.text()).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);

        await worker.fetch(new Request(`${WORKER_BASE}/health`), env);
        expect(
          logSpy.mock.calls.filter(
            (call) => call[0] === WORKER_MEDIA_BINDING_MISSING_LOG,
          ),
        ).toHaveLength(1);
      } finally {
        storage.close();
      }
    } finally {
      logSpy.mockRestore();
      resetWorkerProductionAuthCacheForTests();
      resetWorkerProductionModuleImportForTests();
      resetWorkerMediaBindingMissingLogForTests();
    }
  });

  it("missing auth secret still fails the whole Worker closed with auth misconfig log", async () => {
    resetWorkerProductionAuthCacheForTests();
    resetWorkerProductionModuleImportForTests();
    resetWorkerMediaBindingMissingLogForTests();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { storage } = await openWorkerAuthTestDatabase();
      try {
        const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
        const env = buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          BETTER_AUTH_SECRET: "too-short",
        });

        const auth = await worker.fetch(
          new Request(`${WORKER_BASE}/api/auth/sign-in/social`, { method: "POST" }),
          env,
        );
        expect(auth.status).toBe(503);
        expect(logSpy).toHaveBeenCalledWith(WORKER_PRODUCTION_AUTH_MISCONFIG_LOG);
        expect(logSpy).not.toHaveBeenCalledWith(WORKER_MEDIA_BINDING_MISSING_LOG);
      } finally {
        storage.close();
      }
    } finally {
      logSpy.mockRestore();
      resetWorkerProductionAuthCacheForTests();
      resetWorkerProductionModuleImportForTests();
      resetWorkerMediaBindingMissingLogForTests();
    }
  });
});
