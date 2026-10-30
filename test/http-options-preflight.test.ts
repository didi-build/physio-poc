import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { createTestAppDependencies } from "./mcp-server-test-utils.js";

describe("OPTIONS CORS preflight (integration)", () => {
  it("returns 204 without reading storage ports", async () => {
    const deps = createTestAppDependencies();
    const sqlRun = vi.spyOn(deps.sql, "run");
    const objectGet = vi.spyOn(deps.objects, "get");
    const response = await handleRequest(
      new Request("http://127.0.0.1:8787/programs", {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.example.com",
          "Access-Control-Request-Method": "GET",
        },
      }),
      deps,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(sqlRun).not.toHaveBeenCalled();
    expect(objectGet).not.toHaveBeenCalled();
  });
});
