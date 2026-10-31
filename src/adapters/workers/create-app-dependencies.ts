import { FailClosedAuthPort } from "../../auth/fail-closed-auth-port.js";
import {
  assertWorkerProductionAuthConfigValid,
  WORKER_PRODUCTION_AUTH_MISCONFIG_LOG,
} from "../../auth/worker-production-auth-config.js";
import type { AppDependencies } from "../../http/app.js";
import { isWorkerProductionAuthEnvComplete } from "../../auth/worker-production-auth-env.js";
import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";
import { D1SqlStorage, type PhysioD1Database } from "./d1-sql-storage.js";
import { createPhysioMcpHttpHandler } from "./mcp/handle-mcp-http-request.js";
import { resolveWorkerFailClosedPhysioServerConfig } from "./resolve-worker-config.js";

export const WORKER_WRANGLER_COMPATIBILITY_DATE = "2025-10-29";

export const WORKER_WRANGLER_COMPATIBILITY_FLAGS = [
  "nodejs_compat",
  "nodejs_compat_do_not_populate_process_env",
] as const;

export type WorkerEnv = {
  WEB_APP_BASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PHYSIO_ALLOWED_GOOGLE_EMAILS?: string;
  PHYSIO_DB?: PhysioD1Database;
};

const workerDbCacheIds = new WeakMap<object, number>();
let nextWorkerDbCacheId = 1;

function workerPhysioDbCacheToken(db: PhysioD1Database | undefined): string {
  if (!db) {
    return "";
  }
  const key = db as object;
  let id = workerDbCacheIds.get(key);
  if (id === undefined) {
    id = nextWorkerDbCacheId++;
    workerDbCacheIds.set(key, id);
  }
  return String(id);
}

let cachedProductionEnvKey: string | null = null;
let cachedProductionDeps: AppDependencies | null = null;

function workerProductionEnvCacheKey(env: WorkerEnv): string {
  return [
    env.WEB_APP_BASE_URL ?? "",
    env.BETTER_AUTH_SECRET ?? "",
    env.GOOGLE_CLIENT_ID ?? "",
    env.GOOGLE_CLIENT_SECRET ?? "",
    env.PHYSIO_ALLOWED_GOOGLE_EMAILS ?? "",
    workerPhysioDbCacheToken(env.PHYSIO_DB),
  ].join("\u001e");
}

let workerProductionMisconfigLogged = false;

export function resetWorkerProductionAuthCacheForTests(): void {
  cachedProductionEnvKey = null;
  cachedProductionDeps = null;
  workerProductionMisconfigLogged = false;
}

export function createFailClosedWorkerAppDependencies(env: WorkerEnv): AppDependencies {
  const config = resolveWorkerFailClosedPhysioServerConfig(env);
  return {
    sql: new D1SqlStorage(env.PHYSIO_DB),
    objects: new InMemoryObjectStorage(),
    config,
    auth: new FailClosedAuthPort(),
    mcp: createPhysioMcpHttpHandler(config),
    guardedAppWithoutSession: "service-unavailable",
  };
}

export async function createWorkerAppDependencies(
  env: WorkerEnv,
): Promise<AppDependencies> {
  if (!isWorkerProductionAuthEnvComplete(env) || !env.PHYSIO_DB) {
    return createFailClosedWorkerAppDependencies(env);
  }
  try {
    assertWorkerProductionAuthConfigValid(env);
    const cacheKey = workerProductionEnvCacheKey(env);
    if (cachedProductionEnvKey === cacheKey && cachedProductionDeps) {
      return cachedProductionDeps;
    }
    const { createWorkerProductionAppDependencies } =
      await import("./create-worker-production-app-dependencies.js");
    const deps = createWorkerProductionAppDependencies(env);
    cachedProductionEnvKey = cacheKey;
    cachedProductionDeps = deps;
    return deps;
  } catch {
    if (!workerProductionMisconfigLogged) {
      console.log(WORKER_PRODUCTION_AUTH_MISCONFIG_LOG);
      workerProductionMisconfigLogged = true;
    }
    cachedProductionEnvKey = null;
    cachedProductionDeps = null;
    return createFailClosedWorkerAppDependencies(env);
  }
}
