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

export type { WorkerAssetsBinding } from "./worker-assets-ui-static-port.js";

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
  ASSETS?: import("./worker-assets-ui-static-port.js").WorkerAssetsBinding;
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
let productionSetupInflightKey: string | null = null;
let productionSetupInflight: Promise<AppDependencies> | null = null;

type WorkerProductionModule =
  typeof import("./create-worker-production-app-dependencies.js");

let productionModuleImport: Promise<WorkerProductionModule> | null = null;

function loadWorkerProductionModule(): Promise<WorkerProductionModule> {
  productionModuleImport ??= import("./create-worker-production-app-dependencies.js");
  return productionModuleImport;
}

export function resetWorkerProductionModuleImportForTests(): void {
  productionModuleImport = null;
}

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

let workerProductionDepsSetupDelayMsForTests = 0;

export function setWorkerProductionDepsSetupDelayMsForTests(ms: number): void {
  workerProductionDepsSetupDelayMsForTests = Math.max(0, ms);
}

export function resetWorkerProductionAuthCacheForTests(): void {
  cachedProductionEnvKey = null;
  cachedProductionDeps = null;
  workerProductionMisconfigLogged = false;
  productionSetupInflightKey = null;
  productionSetupInflight = null;
  workerProductionDepsSetupDelayMsForTests = 0;
  productionModuleImport = null;
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

async function awaitWorkerProductionDepsSetupDelayForTests(): Promise<void> {
  const delayMs = workerProductionDepsSetupDelayMsForTests;
  if (delayMs <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function finishProductionSetupInflight(cacheKey: string): void {
  if (productionSetupInflightKey === cacheKey) {
    productionSetupInflightKey = null;
    productionSetupInflight = null;
  }
}

async function buildProductionAppDependencies(
  env: WorkerEnv,
  cacheKey: string,
): Promise<AppDependencies> {
  const { createWorkerProductionAppDependencies } = await loadWorkerProductionModule();
  const deps = createWorkerProductionAppDependencies(env);
  const auth = deps.auth as {
    getBetterAuthRuntime?: () => {
      $context: Promise<{ checkSchema?: () => Promise<void> }>;
    };
  };
  if (typeof auth.getBetterAuthRuntime === "function") {
    const ctx = await auth.getBetterAuthRuntime().$context;
    await ctx.checkSchema?.();
  }
  cachedProductionEnvKey = cacheKey;
  cachedProductionDeps = deps;
  return deps;
}

async function resolveWorkerProductionAppDependencies(
  env: WorkerEnv,
  cacheKey: string,
  registerWaitUntil?: (promise: Promise<AppDependencies>) => void,
): Promise<AppDependencies> {
  if (cachedProductionEnvKey === cacheKey && cachedProductionDeps) {
    return cachedProductionDeps;
  }
  if (productionSetupInflight && productionSetupInflightKey === cacheKey) {
    return productionSetupInflight;
  }

  const inflight = (async () => {
    try {
      await awaitWorkerProductionDepsSetupDelayForTests();
      if (cachedProductionEnvKey === cacheKey && cachedProductionDeps) {
        return cachedProductionDeps;
      }
      return await buildProductionAppDependencies(env, cacheKey);
    } finally {
      finishProductionSetupInflight(cacheKey);
    }
  })();
  productionSetupInflightKey = cacheKey;
  productionSetupInflight = inflight;
  registerWaitUntil?.(inflight);
  return inflight;
}

export type WorkerProductionSetupWaitUntil = (promise: Promise<unknown>) => void;

export type WorkerFetchDependencyOptions = {
  waitUntil?: WorkerProductionSetupWaitUntil;
};

export async function createWorkerAppDependencies(
  env: WorkerEnv,
): Promise<AppDependencies> {
  return createWorkerAppDependenciesForWorkerFetch(env);
}

export async function createWorkerAppDependenciesForWorkerFetch(
  env: WorkerEnv,
  options?: WorkerFetchDependencyOptions,
): Promise<AppDependencies> {
  if (!isWorkerProductionAuthEnvComplete(env) || !env.PHYSIO_DB) {
    return createFailClosedWorkerAppDependencies(env);
  }
  try {
    assertWorkerProductionAuthConfigValid(env);
    const cacheKey = workerProductionEnvCacheKey(env);
    return await resolveWorkerProductionAppDependencies(
      env,
      cacheKey,
      options?.waitUntil,
    );
  } catch {
    if (!workerProductionMisconfigLogged) {
      console.log(WORKER_PRODUCTION_AUTH_MISCONFIG_LOG);
      workerProductionMisconfigLogged = true;
    }
    cachedProductionEnvKey = null;
    cachedProductionDeps = null;
    productionSetupInflightKey = null;
    productionSetupInflight = null;
    return createFailClosedWorkerAppDependencies(env);
  }
}
