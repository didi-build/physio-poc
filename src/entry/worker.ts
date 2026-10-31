import {
  createWorkerAppDependencies,
  type WorkerEnv,
} from "../adapters/workers/create-app-dependencies.js";
import { handleRequest } from "../http/app.js";

/** Cloudflare Workers entry. Production auth loads via createWorkerAppDependencies when env + D1 are valid. */
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const deps = await createWorkerAppDependencies(env);
    return handleRequest(request, deps);
  },
};
