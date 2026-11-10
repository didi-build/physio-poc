import {
  createWorkerAppDependenciesForWorkerFetch,
  type WorkerEnv,
} from "../adapters/workers/create-app-dependencies.js";
import { handleRequest } from "../http/app.js";

export type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
};

const noopExecutionContext: WorkerExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

/** Cloudflare Workers entry. Production auth loads via createWorkerAppDependencies when env + D1 are valid. */
export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: WorkerExecutionContext = noopExecutionContext,
  ): Promise<Response> {
    const deps = await createWorkerAppDependenciesForWorkerFetch(env, {
      waitUntil: (promise) => ctx.waitUntil(promise),
    });
    return handleRequest(request, deps);
  },
};
