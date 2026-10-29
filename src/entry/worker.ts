import { createWorkerAppDependencies } from "../adapters/workers/create-app-dependencies.js";
import type { WorkerEnv } from "../adapters/workers/create-app-dependencies.js";
import { handleRequest } from "../http/app.js";

/**
 * Cloudflare Workers entry. Bindings (D1, R2) are injected in a later ticket via deps factory.
 */
export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, createWorkerAppDependencies(env));
  },
};
