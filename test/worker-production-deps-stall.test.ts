import { describe, expect, it } from "vitest";
import worker from "../src/entry/worker.js";
import {
  createWorkerAppDependencies,
  resetWorkerProductionAuthCacheForTests,
  setWorkerProductionDepsSetupDelayMsForTests,
} from "../src/adapters/workers/create-app-dependencies.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import {
  openWorkerAuthTestDatabase,
  seedPractitioner,
} from "./helpers/worker-auth-d1-fixture.js";
import {
  buildWorkerProductionAuthEnv,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";

describe("Worker production deps init (DIDI-1187)", () => {
  it("lets concurrent cold-start callers share one in-flight setup and finish within a timeout", async () => {
    resetWorkerProductionAuthCacheForTests();
    setWorkerProductionDepsSetupDelayMsForTests(120);
    const { d1, storage } = await openWorkerAuthTestDatabase();
    await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
    const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 });

    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => createWorkerAppDependencies(env)),
    );
    const elapsedMs = Date.now() - started;

    expect(elapsedMs).toBeLessThan(2_000);
    const firstAuth = results[0]?.auth;
    for (const deps of results) {
      expect(deps.auth).toBe(firstAuth);
    }
  });

  it("serves concurrent worker.fetch auth probes while production deps setup is in flight", async () => {
    resetWorkerProductionAuthCacheForTests();
    setWorkerProductionDepsSetupDelayMsForTests(150);
    const { d1, storage } = await openWorkerAuthTestDatabase();
    await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
    const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 });

    const [, health, authOk, getSession] = await Promise.all([
      createWorkerAppDependencies(env),
      worker.fetch(new Request(`${WORKER_PRODUCTION_TEST_BASE}/health`), env),
      worker.fetch(new Request(`${WORKER_PRODUCTION_TEST_BASE}/api/auth/ok`), env),
      worker.fetch(
        new Request(`${WORKER_PRODUCTION_TEST_BASE}/api/auth/get-session`),
        env,
      ),
    ]);

    expect(health.status).toBe(200);
    expect(authOk.status).toBe(200);
    expect(getSession.status).toBe(200);
  });
});
