import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type StaticFileServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startStaticFileServer(
  rootDir: string,
): Promise<StaticFileServer> {
  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") {
        pathname = "/index.html";
      }
      const filePath = join(rootDir, pathname.replace(/^\//, ""));
      let body: Buffer;
      try {
        body = await readFile(filePath);
      } catch {
        body = await readFile(join(rootDir, "index.html"));
      }
      const ext = pathname.split(".").pop() ?? "";
      const type =
        ext === "html"
          ? "text/html"
          : ext === "js"
            ? "text/javascript"
            : ext === "css"
              ? "text/css"
              : "application/octet-stream";
      res.statusCode = 200;
      res.setHeader("content-type", type);
      res.end(body);
    } catch {
      res.statusCode = 500;
      res.end("error");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
