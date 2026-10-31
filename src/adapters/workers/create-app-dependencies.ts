import { FailClosedAuthPort } from "../../auth/fail-closed-auth-port.js";
import type { AppDependencies } from "../../http/app.js";
import { resolveNodePhysioServerConfig } from "../node/resolve-node-config.js";
import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";
import { D1SqlStorage, type PhysioD1Database } from "./d1-sql-storage.js";
import { createPhysioMcpHttpHandler } from "./mcp/handle-mcp-http-request.js";

export type WorkerEnv = {
  WEB_APP_BASE_URL?: string;
  PHYSIO_USE_FAKE_GOOGLE_PROVIDER?: string;
  PHYSIO_DB?: PhysioD1Database;
};

export function createWorkerAppDependencies(env: WorkerEnv): AppDependencies {
  void env.PHYSIO_USE_FAKE_GOOGLE_PROVIDER;
  const config = resolveNodePhysioServerConfig({
    WEB_APP_BASE_URL: env.WEB_APP_BASE_URL,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "false",
    NODE_ENV: "production",
  });
  return {
    sql: new D1SqlStorage(env.PHYSIO_DB),
    objects: new InMemoryObjectStorage(),
    config,
    auth: new FailClosedAuthPort(),
    mcp: createPhysioMcpHttpHandler(config),
    enableFakeGoogleRoutes: false,
    guardedAppWithoutSession: "service-unavailable",
  };
}
