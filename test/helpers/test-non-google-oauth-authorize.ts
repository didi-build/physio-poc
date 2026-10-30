import type { FakeGoogleFixture } from "../../src/auth/fake-google-http.js";
import { fakeGoogleFixtureForCode } from "../../src/auth/fake-google-http.js";

export const TEST_NON_GOOGLE_OAUTH_AUTH_PATH =
  "/__test-non-google-oauth/o/oauth2/v2/auth";

export function testNonGoogleOAuthExpectedRedirectUri(
  authBaseUrl: string,
  providerId: string,
): string {
  const base = authBaseUrl.replace(/\/$/, "");
  return `${base}/api/auth/callback/${providerId}`;
}

export async function handleTestNonGoogleOAuthAuthorizeRequest(
  request: Request,
  authBaseUrl: string,
  providerId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== TEST_NON_GOOGLE_OAUTH_AUTH_PATH) {
    return null;
  }
  if (request.method !== "GET") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state") ?? "";
  const fixture = (url.searchParams.get("fixture") ?? "allowed") as FakeGoogleFixture;
  const code =
    fixture === "refused"
      ? "refused-code"
      : fixture === "unverified"
        ? "unverified-code"
        : fixture === "allowed-upper-email"
          ? "allowed-upper-code"
          : "allowed-code";
  if (!redirectUri) {
    return new Response("missing redirect_uri", { status: 400 });
  }
  const expectedRedirect = testNonGoogleOAuthExpectedRedirectUri(
    authBaseUrl,
    providerId,
  );
  if (redirectUri !== expectedRedirect) {
    return new Response("invalid redirect_uri", { status: 400 });
  }
  if (!fakeGoogleFixtureForCode(code)) {
    return new Response("invalid fixture", { status: 400 });
  }
  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  target.searchParams.set("state", state);
  return Response.redirect(target.toString(), 302);
}
