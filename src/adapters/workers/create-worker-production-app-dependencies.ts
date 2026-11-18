import type { D1Database } from "@better-auth/core";
import type { AppDependencies } from "../../http/app.js";
import { D1SqlStorage } from "./d1-sql-storage.js";
import {
  logWorkerMediaBindingMissingOnce,
  MediaBindingMissingObjectStorage,
} from "./media-binding-missing-object-storage.js";
import { R2ObjectStorage } from "./r2-object-storage.js";
import type { ObjectStoragePort } from "../../storage/ports/object-storage.js";
import { createPhysioMcpHttpHandler } from "./mcp/handle-mcp-http-request.js";
import {
  createMcpBearerAuthHandler,
  createPhysioAuthPort,
} from "../node/create-physio-auth-port.js";
import { resolveWorkerPhysioServerConfig } from "./resolve-worker-config.js";
import { workerCimdMetadataFetch } from "./worker-cimd-metadata-fetch.js";
import type { WorkerEnv } from "./create-app-dependencies.js";
import { createWorkerAssetsUiStaticPort } from "./worker-assets-ui-static-port.js";

/** Production Better Auth wiring (dynamic import from create-app-dependencies). */
export function createWorkerProductionAppDependencies(env: WorkerEnv): AppDependencies {
  if (!env.PHYSIO_DB) {
    throw new Error("PHYSIO_DB binding is required for production Worker auth");
  }
  const sql = new D1SqlStorage(env.PHYSIO_DB);
  const config = resolveWorkerPhysioServerConfig(env);
  const authBundle = createPhysioAuthPort(
    env.PHYSIO_DB as unknown as D1Database,
    sql,
    config,
    {
      cimdMetadataFetch: workerCimdMetadataFetch,
    },
  );
  const uiStatic = env.ASSETS
    ? createWorkerAssetsUiStaticPort(env.ASSETS, config.webAppBaseUrl)
    : undefined;
  const objects = resolveProductionObjectStorage(env);
  return {
    sql,
    objects,
    config,
    auth: authBundle.auth,
    mcp: createPhysioMcpHttpHandler({ config, sql }),
    mcpBearerAuth: createMcpBearerAuthHandler(authBundle, config, sql),
    guardedAppWithoutSession: "redirect",
    uiStatic,
  };
}

function resolveProductionObjectStorage(env: WorkerEnv): ObjectStoragePort {
  if (env.PHYSIO_MEDIA) {
    return new R2ObjectStorage(env.PHYSIO_MEDIA);
  }
  logWorkerMediaBindingMissingOnce();
  return new MediaBindingMissingObjectStorage();
}
