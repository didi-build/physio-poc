import type { ObjectStoragePort } from "../storage/ports/object-storage.js";
import type { SqlStoragePort } from "../storage/ports/sql-storage.js";
import { handleHealthRequest } from "./routes/health.js";

export type AppDependencies = {
  sql: SqlStoragePort;
  objects: ObjectStoragePort;
};

export async function handleRequest(
  request: Request,
  deps: AppDependencies,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return handleHealthRequest(deps);
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}
