import { handleFakeGoogleRequest } from "../../src/auth/fake-google-http.js";
import type { AppDependencies } from "../../src/http/app.js";
import {
  createWorkerAppDependencies,
  type WorkerEnv,
} from "../../src/adapters/workers/create-app-dependencies.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../../src/auth/fake-google-http.js";
import {
  openWorkerAuthTestDatabase,
  seedPractitioner,
} from "./worker-auth-d1-fixture.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./physio-test-auth-secret.js";

export const WORKER_PRODUCTION_TEST_BASE = "https://example.workers.dev";
const FIXTURE_GOOGLE_CLIENT_ID = "fixture-worker-google-client-id";
const FIXTURE_GOOGLE_CLIENT_SECRET = "fixture-worker-google-client-secret";

export function buildWorkerProductionAuthEnv(
  overrides: Partial<WorkerEnv> = {},
): WorkerEnv {
  return {
    WEB_APP_BASE_URL: WORKER_PRODUCTION_TEST_BASE,
    BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: FIXTURE_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: FIXTURE_GOOGLE_CLIENT_SECRET,
    PHYSIO_ALLOWED_GOOGLE_EMAILS: FAKE_GOOGLE_ALLOWED_EMAIL,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "false",
    ...overrides,
  };
}

export async function createWorkerProductionAuthTestDeps(
  envOverrides: Partial<WorkerEnv> = {},
): Promise<{
  deps: AppDependencies;
  env: WorkerEnv;
}> {
  const { d1, storage } = await openWorkerAuthTestDatabase();
  await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
  const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1, ...envOverrides });
  const deps = await createWorkerAppDependencies(env);
  return { deps, env };
}

export { handleFakeGoogleRequest };
