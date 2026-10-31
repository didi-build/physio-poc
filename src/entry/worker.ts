import {
  createFailClosedWorkerAppDependencies,
  type WorkerEnv,
} from "../adapters/workers/create-app-dependencies.js";
import { isWorkerProductionAuthEnvComplete } from "../auth/worker-production-auth-env.js";
import { handleRequest } from "../http/app.js";

/** Cloudflare Workers entry. Production auth loads via dynamic import when env + D1 are complete. */
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    let deps;
    if (isWorkerProductionAuthEnvComplete(env) && env.PHYSIO_DB) {
      const { createWorkerProductionAppDependencies } =
        await import("../adapters/workers/create-worker-production-app-dependencies.js");
      deps = createWorkerProductionAppDependencies(env);
    } else {
      deps = createFailClosedWorkerAppDependencies(env);
    }
    return handleRequest(request, deps);
  },
};
