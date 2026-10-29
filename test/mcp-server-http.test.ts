import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  PHYSIO_MCP_TOOL_NAMES,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
  getPhysioMcpTool,
} from "../src/mcp-connector/index.js";
import { handleRequest, MCP_PATH } from "../src/http/handle-request.js";

const Ajv = AjvModule.default ?? AjvModule;
const addFormats = addFormatsModule.default ?? addFormatsModule;

const TEST_CONFIG = {
  webAppBaseUrl: "https://app.example.com",
} as const;

const MCP_BASE = "https://physio-mcp.test.example";

function createMcpFetch(): FetchLike {
  return async (input, init) => {
    const parsed = new URL(input instanceof URL ? input.href : input);
    const localUrl = `${MCP_BASE}${parsed.pathname}${parsed.search}`;
    const request = new Request(localUrl, {
      method: init?.method ?? "GET",
      headers: init?.headers,
      body: init?.body ?? undefined,
    });
    return handleRequest(request, TEST_CONFIG);
  };
}

async function withMcpClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`${MCP_BASE}${MCP_PATH}`),
    {
      fetch: createMcpFetch(),
    },
  );
  const client = new Client({ name: "physio-mcp-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

const ajv = new Ajv({
  strict: false,
  validateFormats: true,
  validateSchema: false,
  allErrors: true,
});
addFormats(ajv);

const minimalArgsByTool: Record<string, Record<string, unknown>> = {
  [SEARCH_APPROVED_EXERCISES_TOOL_NAME]: { query: "calf stretch" },
  [SEARCH_ROUTINES_TOOL_NAME]: { query: "knee mobility" },
  [BUILD_OR_EDIT_PROGRAM_TOOL_NAME]: {
    program_title: "Sample balance plan",
    rows: [
      {
        exercise_name: "Heel slides",
        prescription_type: "stretching",
        params: { sets: 3, reps: 10 },
      },
    ],
  },
  [GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME]: { program_code: "PRG-STUB01" },
};

describe("Physio MCP HTTP handler (Streamable HTTP)", () => {
  it("lists every DIDI-989 tool", async () => {
    await withMcpClient(async (client) => {
      const { tools } = await client.listTools();
      expect(tools?.map((tool) => tool.name).sort()).toEqual(
        [...PHYSIO_MCP_TOOL_NAMES].sort(),
      );
    });
  });

  it("returns example structured content for each tool", async () => {
    await withMcpClient(async (client) => {
      for (const name of PHYSIO_MCP_TOOL_NAMES) {
        const result = await client.callTool({
          name,
          arguments: minimalArgsByTool[name],
        });
        expect(result.isError, name).not.toBe(true);
        expect(result.structuredContent, name).toBeTruthy();
        const summary = (result.structuredContent as { summary?: string }).summary;
        expect(String(summary), name).toMatch(/^Example response:/);

        const tool = getPhysioMcpTool(name);
        expect(tool).toBeDefined();
        const validate = ajv.compile(tool!.outputSchema);
        expect(validate(result.structuredContent), name).toBe(true);
      }
    });
  });

  it("rejects get_program_share_link_or_pdf without program_code or program_title", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        arguments: { publish: false },
      });
      expect(result.isError).toBe(true);
      const firstContent = Array.isArray(result.content)
        ? result.content[0]
        : undefined;
      const message =
        firstContent &&
        typeof firstContent === "object" &&
        "text" in firstContent &&
        typeof firstContent.text === "string"
          ? firstContent.text
          : "";
      expect(message).toMatch(/program_code or program_title/i);
    });
  });
});

describe("wrangler worker name pin", () => {
  it("uses the physio-poc-mcp worker name", () => {
    const wranglerPath = join(process.cwd(), "wrangler.jsonc");
    const text = readFileSync(wranglerPath, "utf8");
    expect(text).toMatch(/"name"\s*:\s*"physio-poc-mcp"/);
  });
});
