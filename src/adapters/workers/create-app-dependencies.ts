import { FailClosedAuthPort } from "../../auth/fail-closed-auth-port.js";
import type { AppDependencies } from "../../http/app.js";
import { resolveNodePhysioServerConfig } from "../node/resolve-node-config.js";
import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../../storage/adapters/memory/in-memory-sql-storage.js";
import { createPhysioMcpHttpHandler } from "./mcp/handle-mcp-http-request.js";

export type WorkerEnv = {
  WEB_APP_BASE_URL?: string;
  PHYSIO_USE_FAKE_GOOGLE_PROVIDER?: string;
};

export function createWorkerAppDependencies(env: WorkerEnv): AppDependencies {
  void env.PHYSIO_USE_FAKE_GOOGLE_PROVIDER;
  const config = resolveNodePhysioServerConfig({
    WEB_APP_BASE_URL: env.WEB_APP_BASE_URL,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "false",
    NODE_ENV: "production",
  });
  return {
    sql: new InMemorySqlStorage(),
    objects: new InMemoryObjectStorage(),
    config,
    auth: new FailClosedAuthPort(),
    mcp: createPhysioMcpHttpHandler(config),
    enableFakeGoogleRoutes: false,
    guardedAppWithoutSession: "service-unavailable",
    enableUnauthenticatedApi: false,
  };
}
