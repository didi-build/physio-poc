import type { WorkerAssetsBinding } from "../../src/adapters/workers/worker-assets-ui-static-port.js";

export const WORKER_UI_SHELL_MARKER = "physio-worker-ui-shell-didi-1169";

export const WORKER_UI_STUB_ASSET_PATH = "/assets/app-stub-deadbeef.js";

export function createStubWorkerAssetsBinding(
  overrides: Partial<{
    indexHtml: string;
    assetBody: string;
    assetPath: string;
  }> = {},
): WorkerAssetsBinding {
  const indexHtml =
    overrides.indexHtml ??
    `<!DOCTYPE html><html><head><title>Physio</title></head><body>${WORKER_UI_SHELL_MARKER}</body></html>`;
  const assetPath = overrides.assetPath ?? WORKER_UI_STUB_ASSET_PATH;
  const assetBody = overrides.assetBody ?? "console.log('stub-asset');";

  return {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const requestUrl =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      const pathname = requestUrl.pathname;
      if (pathname === "/index.html") {
        return new Response(indexHtml, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (pathname === assetPath) {
        return new Response(assetBody, {
          status: 200,
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
      }
      return new Response(null, { status: 404 });
    },
  };
}
