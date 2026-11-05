import { describe, expect, it } from "vitest";
import { InvalidWebAppBaseUrlError } from "../src/http/config.js";
import { resolveWorkerProductionWebAppBaseUrl } from "../src/auth/worker-production-web-app-base-url.js";

describe("resolveWorkerProductionWebAppBaseUrl (DIDI-1164)", () => {
  const webAppBaseUrlWithUserinfo = "https://user@example.workers.dev";

  it("accepts a bare https origin", () => {
    expect(resolveWorkerProductionWebAppBaseUrl("https://example.workers.dev")).toBe(
      "https://example.workers.dev",
    );
  });

  it.each([
    { label: "http", value: "http://example.workers.dev" },
    { label: "path", value: "https://example.workers.dev/programs" },
    { label: "query", value: "https://example.workers.dev?x=1" },
    { label: "fragment", value: "https://example.workers.dev#x" },
    { label: "userinfo", value: webAppBaseUrlWithUserinfo },
    { label: "trailing slash", value: "https://example.workers.dev/" },
  ])("rejects $label", ({ value }) => {
    expect(() => resolveWorkerProductionWebAppBaseUrl(value)).toThrow(
      InvalidWebAppBaseUrlError,
    );
  });
});
