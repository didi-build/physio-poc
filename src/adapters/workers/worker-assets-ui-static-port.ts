import type { UiStaticPort } from "../../http/ui-static-port.js";

export type WorkerAssetsBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

const HASHED_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const INDEX_HTML_CACHE_CONTROL = "no-cache";

function withCacheControl(response: Response, cacheControl: string): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createWorkerAssetsUiStaticPort(
  assets: WorkerAssetsBinding,
  webAppBaseUrl: string,
): UiStaticPort {
  const baseUrl = webAppBaseUrl.endsWith("/")
    ? webAppBaseUrl.slice(0, -1)
    : webAppBaseUrl;

  return {
    async tryServeAsset(pathname: string): Promise<Response | null> {
      if (!pathname.startsWith("/assets/")) {
        return null;
      }
      const response = await assets.fetch(new Request(`${baseUrl}${pathname}`));
      if (response.status === 404) {
        return null;
      }
      return withCacheControl(response, HASHED_ASSET_CACHE_CONTROL);
    },
    async renderAppShell(): Promise<Response | null> {
      const response = await assets.fetch(new Request(`${baseUrl}/index.html`));
      if (response.status === 404) {
        return null;
      }
      return withCacheControl(response, INDEX_HTML_CACHE_CONTROL);
    },
  };
}
