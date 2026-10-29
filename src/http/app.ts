import type { ObjectStoragePort } from "../storage/ports/object-storage.js";
import type { SqlStoragePort } from "../storage/ports/sql-storage.js";
import { handleHealthRequest } from "./routes/health.js";

export type AppDependencies = {
  sql: SqlStoragePort;
  objects: ObjectStoragePort;
};

const JSON_HEADERS = { "content-type": "application/json" };

export async function handleRequest(
  request: Request,
  deps: AppDependencies,
): Promise<Response> {
  void deps;
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

  return Response.json({ error: "not_found" }, { status: 404, headers: JSON_HEADERS });
}
