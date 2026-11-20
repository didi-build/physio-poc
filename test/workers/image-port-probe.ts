import { createWorkerImageGenerationPort } from "../../src/adapters/workers/create-worker-image-generation-port.js";

export interface ImagePortProbeEnv {
  PHYSIO_DEEPINFRA_API_KEY: string;
}

export default {
  async fetch(_request: Request, env: ImagePortProbeEnv): Promise<Response> {
    const port = createWorkerImageGenerationPort(env);
    try {
      await port.generateStartImage("workerd-probe-prompt");
      return Response.json({ ok: false, reason: "expected_error" }, { status: 500 });
    } catch (error: unknown) {
      const err = error as { code?: string; statusCode?: number; name?: string };
      return Response.json({
        code: err.code ?? null,
        statusCode: err.statusCode ?? null,
        name: err.name ?? null,
      });
    }
  },
};
