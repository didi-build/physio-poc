import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PHYSIO_MCP_TOOLS } from "../../mcp-connector/index.js";
import type { PhysioServerConfig } from "../config.js";
import { invokePhysioMcpStubTool } from "../../services/mcp/stub-tool-handler.js";

export function createPhysioMcpServer(config: PhysioServerConfig): Server {
  const server = new Server(
    { name: "physio-poc-mcp", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: PHYSIO_MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const structured = await invokePhysioMcpStubTool(
        request.params.name,
        request.params.arguments ?? {},
        config,
      );
      const summary =
        typeof structured.summary === "string"
          ? structured.summary
          : "Example response returned.";
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: structured,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  });

  return server;
}
