import type { PhysioServerConfig } from "./config.js";
import { handleMcpHttpRequest } from "./mcp/handle-mcp-http-request.js";

const MCP_PATH = "/mcp";

export async function handleRequest(
  request: Request,
  config: PhysioServerConfig,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === MCP_PATH || url.pathname === `${MCP_PATH}/`) {
    return handleMcpHttpRequest(request, config);
  }
  if (url.pathname === "/" || url.pathname === "/health") {
    return Response.json(
      { status: "ok", mcp_path: MCP_PATH },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return new Response("Not Found", { status: 404 });
}

export { MCP_PATH };
