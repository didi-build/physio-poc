import { describe, expect, it } from "vitest";
import {
  allowedMutatingAppApiOrigins,
  CSRF_EXEMPT_APP_API_AUTH_PREFIX,
  isApplicationJsonContentType,
  isCsrfExemptAppApiAuthPath,
  isMutatingAppApiPath,
  isNonSafeHttpMethod,
  rejectMutatingAppApiCsrf,
  requestSourceOrigin,
  requiresAppApiCsrfGuard,
} from "../src/http/mutating-app-api-csrf.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { resolveTestPhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

describe("mutating app API CSRF (unit)", () => {
  it("recognizes non-safe app API paths but not Better Auth or safe methods", () => {
    expect(isNonSafeHttpMethod("GET")).toBe(false);
    expect(isNonSafeHttpMethod("HEAD")).toBe(false);
    expect(isNonSafeHttpMethod("OPTIONS")).toBe(false);
    expect(isNonSafeHttpMethod("POST")).toBe(true);
    expect(requiresAppApiCsrfGuard("/api/practitioners/x/my-exercises/y", "POST")).toBe(
      true,
    );
    expect(isMutatingAppApiPath("/api/auth/sign-out", "POST")).toBe(false);
    expect(isCsrfExemptAppApiAuthPath("/api/authx/sign-out")).toBe(false);
    expect(requiresAppApiCsrfGuard("/api/authx/sign-out", "POST")).toBe(true);
    expect(isMutatingAppApiPath("/api/practitioners/x/my-exercises", "GET")).toBe(
      false,
    );
    expect(CSRF_EXEMPT_APP_API_AUTH_PREFIX).toBe("/api/auth");
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

  it("rejects application/x-www-form-urlencoded with 415", () => {
    expect(isApplicationJsonContentType("application/x-www-form-urlencoded")).toBe(
      false,
    );
    const request = new Request("https://physio.test.example/api/x", {
      method: "POST",
      headers: {
        Origin: "https://physio.test.example",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)?.status).toBe(415);
  });

  it("rejects multipart/form-data with 415", () => {
    expect(isApplicationJsonContentType("multipart/form-data; boundary=test")).toBe(
      false,
    );
    const request = new Request("https://physio.test.example/api/x", {
      method: "POST",
      headers: {
        Origin: "https://physio.test.example",
        "Content-Type": "multipart/form-data; boundary=test",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)?.status).toBe(415);
  });
});

describe("mutating app API CSRF regression guards (mutant killers)", () => {
  it("accepts WEB_APP_BASE_URL origin when the request URL host differs", () => {
    const request = new Request("https://physio.test.example/api/x", {
      method: "POST",
      headers: {
        Origin: "https://app.example.com",
        "Content-Type": "application/json",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)).toBeNull();
  });

  it("returns 403 when Origin is the literal null string", () => {
    const request = new Request("https://physio.test.example/api/x", {
      method: "POST",
      headers: {
        Origin: "null",
        "Content-Type": "application/json",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)?.status).toBe(403);
  });

  it("prefers Origin over Referer when Origin is invalid", () => {
    const request = new Request("https://physio.test.example/api/x", {
      method: "POST",
      headers: {
        Origin: "not-a-url",
        Referer: "https://physio.test.example/programs",
        "Content-Type": "application/json",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)?.status).toBe(403);
  });

  it("guards PUT on app API paths", () => {
    expect(isMutatingAppApiPath("/api/practitioners/x/my-exercises/y", "PUT")).toBe(
      true,
    );
    const request = new Request("https://physio.test.example/api/x", {
      method: "PUT",
      headers: {
        Origin: "https://evil.example.com",
        "Content-Type": "application/json",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)?.status).toBe(403);
  });

  it("accepts Origin equal to AUTH_BASE_URL when request and web app origins differ", () => {
    const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET, {
      webAppBaseUrl: "https://web-only.example.com",
      authBaseUrl: "http://127.0.0.1:8787",
    });
    const request = new Request("https://physio.test.example/api/x", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:8787",
        "Content-Type": "application/json",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, config)).toBeNull();
  });
});
