import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createNodeAppDependencies } from "../adapters/node/create-node-app-dependencies.js";
import { handleRequest, type AppDependencies } from "../http/app.js";

export type NodeServerOptions = {
  port?: number;
  host?: string;
  deps?: AppDependencies;
};

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

export async function createDefaultNodeDependencies(): Promise<AppDependencies> {
  return createNodeAppDependencies({
    WEB_APP_BASE_URL: process.env.WEB_APP_BASE_URL,
    AUTH_BASE_URL: process.env.AUTH_BASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    PHYSIO_ALLOWED_GOOGLE_EMAILS: process.env.PHYSIO_ALLOWED_GOOGLE_EMAILS,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: process.env.PHYSIO_USE_FAKE_GOOGLE_PROVIDER,
    NODE_ENV: process.env.NODE_ENV,
  });
}

export function createNodeServer(options: NodeServerOptions = {}) {
  const port = options.port ?? 8787;
  const host = options.host ?? "127.0.0.1";
  let depsPromise: Promise<AppDependencies> | null = null;

  const server = createServer(async (req, res) => {
    try {
      if (!options.deps) {
        depsPromise ??= createDefaultNodeDependencies();
        const deps = await depsPromise;
        const request = await readWebRequest(req);
        const response = await handleRequest(request, deps);
        await writeWebResponse(res, response);
        return;
      }
      const request = await readWebRequest(req);
      const response = await handleRequest(request, options.deps);
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
