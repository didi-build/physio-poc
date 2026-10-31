import { createWorkerAppDependencies } from "../adapters/workers/create-app-dependencies.js";
import type { WorkerEnv } from "../adapters/workers/create-app-dependencies.js";
import { handleRequest } from "../http/app.js";

/** Cloudflare Workers entry. D1 is wired via createWorkerAppDependencies(env). */
export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, createWorkerAppDependencies(env));
  },
};
