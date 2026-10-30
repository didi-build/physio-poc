import type { ObjectStoragePort } from "../storage/ports/object-storage.js";
import type { SqlStoragePort } from "../storage/ports/sql-storage.js";
import type { PhysioServerConfig } from "./config.js";
import { handleHealthRequest } from "./routes/health.js";
import { handleExerciseLibraryRequest } from "./routes/exercise-library.js";
import { handleExerciseRequestsHttpRequest } from "./routes/exercise-requests.js";

export type McpHttpHandler = (request: Request) => Promise<Response>;

export type AppDependencies = {
  sql: SqlStoragePort;
  objects: ObjectStoragePort;
  config: PhysioServerConfig;
  mcp: McpHttpHandler;
  /** When true, registers unauthenticated practitioner exercise API routes (Node dev and tests only). */
  enableUnauthenticatedApi?: boolean;
};

export const MCP_PATH = "/mcp";

const JSON_HEADERS = { "content-type": "application/json" };

export async function handleRequest(
  request: Request,
  deps: AppDependencies,
): Promise<Response> {
  void deps.sql;
  void deps.objects;
  const url = new URL(request.url);

  if (
    (request.method === "GET" || request.method === "HEAD") &&
    url.pathname === "/health"
  ) {
    if (request.method === "HEAD") {
      return new Response(null, { status: 200 });
    }
    return handleHealthRequest();
  }

  if (request.method === "POST" && url.pathname === "/health") {
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers: JSON_HEADERS },
    );
  }

  if (url.pathname === MCP_PATH || url.pathname === `${MCP_PATH}/`) {
    return deps.mcp(request);
  }

  if (deps.enableUnauthenticatedApi === true) {
    const exerciseResponse = await handleExerciseLibraryRequest(request, deps);
    if (exerciseResponse) {
      return exerciseResponse;
    }
    const requestResponse = await handleExerciseRequestsHttpRequest(request, deps);
    if (requestResponse) {
      return requestResponse;
    }
  }

  return Response.json({ error: "not_found" }, { status: 404, headers: JSON_HEADERS });
}
