import { describe, expect, it, vi } from "vitest";
import worker from "../src/entry/worker.js";
import {
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
import type { WorkerExecutionContext } from "../src/entry/worker.js";

describe("Worker production setup waitUntil (DIDI-1187 M2)", () => {
  it("registers waitUntil while production setup is still in flight", async () => {
    resetWorkerProductionAuthCacheForTests();
    setWorkerProductionDepsSetupDelayMsForTests(250);
    const { d1, storage } = await openWorkerAuthTestDatabase();
    await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
    const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 });

    const waitUntil = vi.fn();
    const ctx: WorkerExecutionContext = {
      waitUntil,
      passThroughOnException: vi.fn(),
    };

    const fetchPromise = worker.fetch(
      new Request(`${WORKER_PRODUCTION_TEST_BASE}/health`),
      env,
      ctx,
    );

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    const registered = waitUntil.mock.calls[0]?.[0] as Promise<unknown>;
    expect(registered).toBeInstanceOf(Promise);

    let setupSettled = false;
    void registered.finally(() => {
      setupSettled = true;
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
    expect(setupSettled).toBe(false);

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    await registered;
    expect(setupSettled).toBe(true);
  });
});
