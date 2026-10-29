import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { PhysioServerConfig } from "../src/http/config.js";
import { handleRequest, MCP_PATH } from "../src/http/handle-request.js";

export const MCP_TEST_CONFIG: PhysioServerConfig = {
  webAppBaseUrl: "https://app.example.com",
};

export const MCP_TEST_BASE = "https://physio-mcp.test.example";

export function createHandleRequestFetch(
  config: PhysioServerConfig = MCP_TEST_CONFIG,
): FetchLike {
  return async (input, init) => {
    const parsed = new URL(input instanceof URL ? input.href : input);
    const localUrl = `${MCP_TEST_BASE}${parsed.pathname}${parsed.search}`;
    const request = new Request(localUrl, {
      method: init?.method ?? "GET",
      headers: init?.headers,
      body: init?.body ?? undefined,
    });
    return handleRequest(request, config);
  };
}

export async function withMcpClient<T>(
  run: (client: Client) => Promise<T>,
  options?: { fetch?: FetchLike; baseUrl?: string },
): Promise<T> {
  const baseUrl = options?.baseUrl ?? MCP_TEST_BASE;
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}${MCP_PATH}`),
    {
      fetch: options?.fetch ?? createHandleRequestFetch(),
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

export function toolErrorText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }
  const record = result as { content?: unknown };
  const firstContent = Array.isArray(record.content) ? record.content[0] : undefined;
  if (
    firstContent &&
    typeof firstContent === "object" &&
    "text" in firstContent &&
    typeof firstContent.text === "string"
  ) {
    return firstContent.text;
  }
  return "";
}
