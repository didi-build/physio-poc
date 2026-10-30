import { FakeAuthPort } from "../../auth/fake-auth-port.js";
import type { AppDependencies } from "../../http/app.js";
import { resolveNodePhysioServerConfig } from "../node/resolve-node-config.js";
import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../../storage/adapters/memory/in-memory-sql-storage.js";
import { createPhysioMcpHttpHandler } from "./mcp/handle-mcp-http-request.js";

export type WorkerEnv = {
  WEB_APP_BASE_URL?: string;
};

const WORKER_TEST_PRACTITIONER = {
  practitionerId: "pract-worker-test",
  email: "worker.test@example.com",
  displayName: "Kojo",
} as const;

export function createWorkerAppDependencies(env: WorkerEnv): AppDependencies {
  const config = resolveNodePhysioServerConfig({
    WEB_APP_BASE_URL: env.WEB_APP_BASE_URL,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "false",
    NODE_ENV: "production",
  });
  return {
    sql: new InMemorySqlStorage(),
    objects: new InMemoryObjectStorage(),
    config,
    auth: new FakeAuthPort({ practitioner: WORKER_TEST_PRACTITIONER }),
    mcp: createPhysioMcpHttpHandler(config),
  };
}

export function workerTestSessionCookie(): string {
  return new FakeAuthPort({
    practitioner: WORKER_TEST_PRACTITIONER,
  }).createSessionCookieHeader();
}
