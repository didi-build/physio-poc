import { describe, expect, it } from "vitest";
import {
  rejectMutatingAppApiCsrf,
  requiresAppApiCsrfGuard,
} from "../src/http/mutating-app-api-csrf.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";

describe("mutating app API CSRF guard (unit)", () => {
  it("requires guard for PATCH on session my-defaults routes", () => {
    expect(
      requiresAppApiCsrfGuard("/api/me/my-defaults/share-link-expiry", "PATCH"),
    ).toBe(true);
  });

  it("rejects mutating requests without Origin", () => {
    const request = new Request("http://127.0.0.1/api/me/my-defaults/types/isometric", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const rejection = rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG);
    expect(rejection?.status).toBe(403);
  });

  it("allows mutating requests with same-origin Origin and JSON", () => {
    const request = new Request("http://127.0.0.1/api/me/my-defaults/types/isometric", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1",
      },
      body: "{}",
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)).toBeNull();
  });
});
