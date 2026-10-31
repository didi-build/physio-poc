import { unstable_dev } from "wrangler";
import type { Unstable_DevWorker } from "wrangler";
import { afterEach, describe, expect, it } from "vitest";
import { MCP_PATH } from "../src/http/app.js";
import { ensureWranglerUiAssetsDirectory } from "./helpers/wrangler-ui-assets-fixture.js";

describe("Physio MCP Worker (wrangler dev --local smoke)", () => {
  let worker: Unstable_DevWorker | undefined;

  afterEach(async () => {
    if (worker) {
      await worker.stop();
      worker = undefined;
    }
  });

  it("serves /health and rejects unauthenticated /mcp without a fake session", async () => {
    const assetsFixture = ensureWranglerUiAssetsDirectory();
    try {
      worker = await unstable_dev("src/entry/worker.ts", {
        config: "wrangler.jsonc",
        local: true,
        experimental: { disableExperimentalWarning: true },
      });

      const health = await worker.fetch("http://127.0.0.1/health");
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({
        ok: true,
        service: "physio-poc",
      });

      const mcp = await worker.fetch(`http://127.0.0.1${MCP_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {},
        }),
      });
      expect(mcp.status).toBe(401);
    } finally {
      assetsFixture.cleanup();
    }
  }, 120_000);
}, 130_000);
