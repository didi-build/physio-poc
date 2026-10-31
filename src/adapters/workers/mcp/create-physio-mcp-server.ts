import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PHYSIO_MCP_TOOLS } from "../../../mcp-connector/index.js";
import type { PhysioServerConfig } from "../../../http/config.js";
import { invokePhysioMcpStubTool } from "../../../services/mcp/stub-tool-handler.js";
import { PhysioMcpWorkersSafeJsonSchemaValidator } from "./workers-safe-json-schema-validator.js";

const workersSafeJsonSchemaValidator = new PhysioMcpWorkersSafeJsonSchemaValidator();

export function createPhysioMcpServer(config: PhysioServerConfig): Server {
  const server = new Server(
    { name: "physio-poc", version: "0.0.0" },
    {
      capabilities: { tools: {} },
      jsonSchemaValidator: workersSafeJsonSchemaValidator,
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: PHYSIO_MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
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
