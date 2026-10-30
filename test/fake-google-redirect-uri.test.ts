import { describe, expect, it } from "vitest";
import {
  fakeGoogleExpectedRedirectUri,
  handleFakeGoogleRequest,
} from "../src/auth/fake-google-http.js";
import { InvalidAuthConfigError, resolvePhysioAuthConfig } from "../src/http/config.js";

const AUTH_BASE = "http://127.0.0.1:8787";
const CALLBACK = fakeGoogleExpectedRedirectUri(AUTH_BASE);
const AUTH_PATH = "/__fake-google/o/oauth2/v2/auth";

function authRequest(
  redirectUri: string | null,
  options?: { authBaseUrl?: string; requestOrigin?: string; state?: string },
): Request {
  const requestOrigin = options?.requestOrigin ?? AUTH_BASE;
  const params = new URLSearchParams();
  if (redirectUri !== null) {
    params.set("redirect_uri", redirectUri);
  }
  params.set("state", options?.state ?? "test-state");
  return new Request(`${requestOrigin}${AUTH_PATH}?${params.toString()}`);
}

async function expectAuthResponse(
  redirectUri: string | null,
  authBaseUrl: string,
  options?: { requestOrigin?: string; state?: string },
): Promise<Response> {
  const response = await handleFakeGoogleRequest(
    authRequest(redirectUri, { ...options, authBaseUrl }),
    authBaseUrl,
  );
  expect(response).not.toBeNull();
  return response!;
}

describe("fake Google authorize redirect_uri (DIDI-1093)", () => {
  it("returns 400 with no redirect when redirect_uri is missing", async () => {
    const response = await expectAuthResponse(null, AUTH_BASE);
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("missing redirect_uri");
  });

  it("returns 400 with no redirect for a wrong path on the same origin", async () => {
    const response = await expectAuthResponse(
      `${AUTH_BASE}/api/auth/callback/wrong`,
      AUTH_BASE,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("invalid redirect_uri");
  });

  it("returns 400 with no redirect when redirect_uri uses the request origin but authBaseUrl differs", async () => {
    const authBaseUrl = "http://auth.example.com";
    const requestOrigin = "http://127.0.0.1:8787";
    const redirectUri = `${requestOrigin}/api/auth/callback/google`;
    const response = await expectAuthResponse(redirectUri, authBaseUrl, {
      requestOrigin,
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("invalid redirect_uri");
  });

  it("returns 400 with no redirect for the callback path on a foreign origin", async () => {
    const response = await expectAuthResponse(
      "http://other.example.com/api/auth/callback/google",
      AUTH_BASE,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("invalid redirect_uri");
  });

  it("redirects with code and state when redirect_uri matches authBaseUrl callback", async () => {
    const state = "opaque-state-value";
    const response = await expectAuthResponse(CALLBACK, AUTH_BASE, { state });
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).not.toBeNull();
    const target = new URL(location!);
    expect(target.origin + target.pathname).toBe(CALLBACK);
    expect(target.searchParams.get("code")).toBe("allowed-code");
    expect(target.searchParams.get("state")).toBe(state);
  });

  it("cannot enable the fake Google provider in production config", () => {
    expect(() =>
      resolvePhysioAuthConfig({
        fakeGoogleProvider: "true",
        nodeEnv: "production",
      }),
    ).toThrow(InvalidAuthConfigError);
  });
});
