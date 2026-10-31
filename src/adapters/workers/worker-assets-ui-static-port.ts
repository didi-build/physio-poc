import type { UiStaticPort } from "../../http/ui-static-port.js";

export type WorkerAssetsBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

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
      return response;
    },
    async renderAppShell(): Promise<Response | null> {
      const response = await assets.fetch(new Request(`${baseUrl}/index.html`));
      if (response.status === 404) {
        return null;
      }
      return response;
    },
  };
}
