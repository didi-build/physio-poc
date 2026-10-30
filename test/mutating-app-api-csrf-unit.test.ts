import { describe, expect, it } from "vitest";
import {
  allowedMutatingAppApiOrigins,
  isApplicationJsonContentType,
  isMutatingAppApiPath,
  rejectMutatingAppApiCsrf,
  requestSourceOrigin,
} from "../src/http/mutating-app-api-csrf.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";

describe("mutating app API CSRF (unit)", () => {
  it("recognizes mutating app API paths but not Better Auth or GET", () => {
    expect(isMutatingAppApiPath("/api/practitioners/x/my-exercises/y", "POST")).toBe(
      true,
    );
    expect(isMutatingAppApiPath("/api/auth/sign-out", "POST")).toBe(false);
    expect(isMutatingAppApiPath("/api/practitioners/x/my-exercises", "GET")).toBe(
      false,
    );
  });

  it("parses application/json content types case-insensitively", () => {
    expect(isApplicationJsonContentType("application/json")).toBe(true);
    expect(isApplicationJsonContentType("Application/JSON; charset=utf-8")).toBe(true);
    expect(isApplicationJsonContentType("text/plain")).toBe(false);
  });

  it("derives request source origin from Origin then Referer", () => {
    const fromOrigin = new Request("https://physio.test.example/x", {
      headers: { Origin: "https://app.example.com" },
    });
    expect(requestSourceOrigin(fromOrigin)).toBe("https://app.example.com");

    const fromReferer = new Request("https://physio.test.example/x", {
      headers: { Referer: "https://app.example.com/programs" },
    });
    expect(requestSourceOrigin(fromReferer)).toBe("https://app.example.com");
  });

  it("allows configured and request origins", () => {
    const request = new Request("https://physio.test.example/api/x", {
      method: "POST",
      headers: {
        Origin: "https://physio.test.example",
        "Content-Type": "application/json",
      },
    });
    const allowed = allowedMutatingAppApiOrigins(request, MCP_TEST_CONFIG);
    expect(allowed.has("https://physio.test.example")).toBe(true);
    expect(allowed.has("https://app.example.com")).toBe(true);
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)).toBeNull();
  });

  it("rejects cross-origin mutating requests with 403", () => {
    const request = new Request("https://physio.test.example/api/x", {
      method: "POST",
      headers: {
        Origin: "https://evil.example.com",
        "Content-Type": "application/json",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)?.status).toBe(403);
  });

  it("rejects wrong content type with 415", () => {
    const request = new Request("https://physio.test.example/api/x", {
      method: "POST",
      headers: {
        Origin: "https://physio.test.example",
        "Content-Type": "text/plain",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)?.status).toBe(415);
  });
});
