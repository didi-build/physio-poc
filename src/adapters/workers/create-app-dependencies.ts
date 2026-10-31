import { FailClosedAuthPort } from "../../auth/fail-closed-auth-port.js";
import type { AppDependencies } from "../../http/app.js";
import { isWorkerProductionAuthEnvComplete } from "../../auth/worker-production-auth-env.js";
import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";
import { D1SqlStorage, type PhysioD1Database } from "./d1-sql-storage.js";
import { createPhysioMcpHttpHandler } from "./mcp/handle-mcp-http-request.js";
import { resolveWorkerFailClosedPhysioServerConfig } from "./resolve-worker-config.js";

export type WorkerEnv = {
  WEB_APP_BASE_URL?: string;
  AUTH_BASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PHYSIO_ALLOWED_GOOGLE_EMAILS?: string;
  PHYSIO_USE_FAKE_GOOGLE_PROVIDER?: string;
  PHYSIO_DB?: PhysioD1Database;
};

export function createFailClosedWorkerAppDependencies(env: WorkerEnv): AppDependencies {
  void env.PHYSIO_USE_FAKE_GOOGLE_PROVIDER;
  const config = resolveWorkerFailClosedPhysioServerConfig(env);
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

export async function createWorkerAppDependencies(
  env: WorkerEnv,
): Promise<AppDependencies> {
  if (!isWorkerProductionAuthEnvComplete(env) || !env.PHYSIO_DB) {
    return createFailClosedWorkerAppDependencies(env);
  }
  const { createWorkerProductionAppDependencies } =
    await import("./create-worker-production-app-dependencies.js");
  return createWorkerProductionAppDependencies(env);
}
