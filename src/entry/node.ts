import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { handleRequest, type AppDependencies } from "../http/app.js";
import { InMemoryObjectStorage } from "../storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../storage/adapters/memory/in-memory-sql-storage.js";

export type NodeServerOptions = {
  port?: number;
  host?: string;
  deps?: AppDependencies;
};

function defaultDependencies(): AppDependencies {
  return {
    sql: new InMemorySqlStorage(),
    objects: new InMemoryObjectStorage(),
  };
}

async function readRequestBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export async function readWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const body = await readRequestBody(req);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const part of value) {
        headers.append(key, part);
      }
    } else {
      headers.set(key, value);
    }
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: body ? Buffer.from(body) : null,
  });
}

export async function writeWebResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

export function createNodeServer(options: NodeServerOptions = {}) {
  const deps = options.deps ?? defaultDependencies();
  const port = options.port ?? 8787;
  const host = options.host ?? "127.0.0.1";

  const server = createServer(async (req, res) => {
    try {
      const request = await readWebRequest(req);
      const response = await handleRequest(request, deps);
      await writeWebResponse(res, response);
    } catch (error) {
      console.error("request_failed", error);
      res.statusCode = 500;
      res.end("internal_error");
    }
  });

  server.on("error", (error) => {
    console.error("server_listen_failed", error);
  });

  server.listen(port, host);
  return server;
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  createNodeServer();
}
