import { join } from "node:path";
import { createTestHarness, type TestHarness } from "wrangler";
import { afterEach, describe, expect, it } from "vitest";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import { ensureWranglerUiAssetsDirectory } from "./helpers/wrangler-ui-assets-fixture.js";
import {
  FIXTURE_GOOGLE_CLIENT_SECRET,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const AUTH_OK_PATH = "/api/auth/ok";
const HEALTH_PATH = "/health";
const MAX_AUTH_OK_MS = 2_000;

const WORKER_TEST_VARS = {
  WEB_APP_BASE_URL: WORKER_PRODUCTION_TEST_BASE,
  BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
  GOOGLE_CLIENT_ID: "fixture-worker-google-client-id",
  GOOGLE_CLIENT_SECRET: FIXTURE_GOOGLE_CLIENT_SECRET,
  PHYSIO_ALLOWED_GOOGLE_EMAILS: FAKE_GOOGLE_ALLOWED_EMAIL,
  PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "false",
};

describe("Worker health-first better-auth stall regression (DIDI-1187 M3)", () => {
  let server: TestHarness | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("answers /api/auth/ok within 2s after /health in a fresh isolate", async () => {
    const assetsFixture = ensureWranglerUiAssetsDirectory();
    try {
      server = createTestHarness({
        root: REPO_ROOT,
        workers: [
          {
            configPath: "wrangler.jsonc",
            vars: WORKER_TEST_VARS,
          },
        ],
      });
      await server.listen();
      const worker = server.getWorker();
      await worker.applyD1Migrations("PHYSIO_DB");

      const health = await server.fetch(HEALTH_PATH);
      expect(health.status).toBe(200);

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1_000);
      });

      const started = Date.now();
      const authOk = await server.fetch(AUTH_OK_PATH, {
        signal: AbortSignal.timeout(3_000),
      });
      const elapsedMs = Date.now() - started;

      expect(authOk.status).toBe(200);
      expect(elapsedMs).toBeLessThan(MAX_AUTH_OK_MS);
    } finally {
      assetsFixture.cleanup();
    }
  }, 120_000);
}, 130_000);
