import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { unstable_dev } from "wrangler";
import type { Unstable_DevWorker } from "wrangler";
import { afterEach, describe, expect, it } from "vitest";
import {
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
} from "../src/mcp-connector/index.js";
import { MCP_PATH } from "../src/http/app.js";

describe("Physio MCP Worker (wrangler dev --local smoke)", () => {
  let worker: Unstable_DevWorker | undefined;

  afterEach(async () => {
    if (worker) {
      await worker.stop();
      worker = undefined;
    }
  });

  it("initializes, lists tools, and calls a tool through /mcp in workerd", async () => {
    worker = await unstable_dev("src/entry/worker.ts", {
      config: "wrangler.jsonc",
      local: true,
      experimental: { disableExperimentalWarning: true },
    });

    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1${MCP_PATH}`),
      {
        fetch: (input, init) =>
          worker!.fetch(
            input,
            init as Parameters<Unstable_DevWorker["fetch"]>[1],
          ) as unknown as Promise<Response>,
      },
    );
    const client = new Client({ name: "physio-mcp-worker-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools?.length).toBe(4);

      const result = await client.callTool({
        name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        arguments: { query: "calf stretch" },
      });
      expect(result.isError).not.toBe(true);
      expect((result.structuredContent as { summary?: string }).summary).toMatch(
        /^Example response:/,
      );

      const publishResult = await client.callTool({
        name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        arguments: { program_code: "PRG-STUB01", publish: true },
      });
      expect(publishResult.isError).not.toBe(true);
    } finally {
      await client.close();
    }
  }, 120_000);
}, 130_000);
