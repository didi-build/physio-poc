import type { AppDependencies } from "../../http/app.js";
import { resolveWebAppBaseUrl } from "../../http/config.js";
import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../../storage/adapters/memory/in-memory-sql-storage.js";
import { createPhysioMcpHttpHandler } from "./mcp/handle-mcp-http-request.js";

export type WorkerEnv = {
  WEB_APP_BASE_URL?: string;
};

export function createWorkerAppDependencies(env: WorkerEnv): AppDependencies {
  const config = {
    webAppBaseUrl: resolveWebAppBaseUrl(env.WEB_APP_BASE_URL),
  };
  return {
    sql: new InMemorySqlStorage(),
    objects: new InMemoryObjectStorage(),
    config,
    mcp: createPhysioMcpHttpHandler(config),
  };
}
