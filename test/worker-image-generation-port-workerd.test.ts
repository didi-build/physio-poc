import { join } from "node:path";
import { createTestHarness, type TestHarness } from "wrangler";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");
const PROBE_CONFIG = join(REPO_ROOT, "test/wrangler-image-port-probe.jsonc");
const SENTINEL_API_KEY = "deepinfra-sentinel-key-must-not-appear-in-errors";

describe("createWorkerImageGenerationPort (workerd / Miniflare outbound)", () => {
  let server: TestHarness | undefined;
  let restoreFetch: (() => void) | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
    restoreFetch?.();
    restoreFetch = undefined;
  });

  it("maps DeepInfra 401 to image_generation_request_failed with at least one outbound call", async () => {
    let upstreamCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      upstreamCalls += 1;
      return new Response(JSON.stringify({ detail: SENTINEL_API_KEY }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    };
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    try {
      server = createTestHarness({
        root: REPO_ROOT,
        workers: [
          {
            configPath: PROBE_CONFIG,
            secrets: { PHYSIO_DEEPINFRA_API_KEY: SENTINEL_API_KEY },
          },
        ],
      });
      await server.listen();
      const response = await server.fetch("http://127.0.0.1/probe");
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        code?: string | null;
        statusCode?: number | null;
        name?: string | null;
      };
      expect(body).toEqual({
        code: "image_generation_request_failed",
        statusCode: 401,
        name: "ImageGenerationError",
      });
      expect(upstreamCalls).toBeGreaterThanOrEqual(1);
    } finally {
      restoreFetch();
    }
  }, 120_000);
}, 130_000);
