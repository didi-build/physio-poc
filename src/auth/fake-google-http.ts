/**
 * In-process fake Google OAuth endpoints for tests and local dev (DIDI-1001).
 */
export const FAKE_GOOGLE_ALLOWED_EMAIL = "kojo.allowed@example.com";
export const FAKE_GOOGLE_REFUSED_EMAIL = "refused@example.com";

export type FakeGoogleFixture =
  "allowed" | "refused" | "unverified" | "allowed-upper-email";

const FIXTURE_BY_CODE = new Map<string, FakeGoogleFixture>([
  ["allowed-code", "allowed"],
  ["refused-code", "refused"],
  ["unverified-code", "unverified"],
  ["allowed-upper-code", "allowed-upper-email"],
]);

const TOKEN_BY_FIXTURE: Record<FakeGoogleFixture, string> = {
  allowed: "fake-access-allowed",
  refused: "fake-access-refused",
  unverified: "fake-access-unverified",
  "allowed-upper-email": "fake-access-allowed-upper",
};

export function fakeGoogleFixtureForCode(code: string): FakeGoogleFixture | null {
  return FIXTURE_BY_CODE.get(code) ?? null;
}

export function fakeGoogleAccessTokenForFixture(fixture: FakeGoogleFixture): string {
  return TOKEN_BY_FIXTURE[fixture];
}

export function fakeGoogleFixtureForAccessToken(
  token: string,
): FakeGoogleFixture | null {
  if (token === TOKEN_BY_FIXTURE.allowed) {
    return "allowed";
  }
  if (token === TOKEN_BY_FIXTURE.refused) {
    return "refused";
  }
  if (token === TOKEN_BY_FIXTURE.unverified) {
    return "unverified";
  }
  if (token === TOKEN_BY_FIXTURE["allowed-upper-email"]) {
    return "allowed-upper-email";
  }
  return null;
}

export function fakeGoogleProfile(fixture: FakeGoogleFixture): Record<string, unknown> {
  if (fixture === "unverified") {
    return {
      sub: "fake-google-sub-unverified",
      email: FAKE_GOOGLE_ALLOWED_EMAIL,
      email_verified: false,
      name: "Unverified user",
      picture: "",
    };
  }
  if (fixture === "allowed-upper-email") {
    return {
      sub: "fake-google-sub-allowed-upper",
      email: FAKE_GOOGLE_ALLOWED_EMAIL.toUpperCase(),
      email_verified: true,
      name: "Kojo",
      picture: "",
    };
  }
  const email =
    fixture === "allowed" ? FAKE_GOOGLE_ALLOWED_EMAIL : FAKE_GOOGLE_REFUSED_EMAIL;
  return {
    sub: fixture === "allowed" ? "fake-google-sub-allowed" : "fake-google-sub-refused",
    email,
    email_verified: true,
    name: fixture === "allowed" ? "Kojo" : "Refused user",
    picture: "",
  };
}

async function handleFakeTokenRequest(request: Request): Promise<Response> {
  const bodyText = await request.text();
  const params = new URLSearchParams(bodyText);
  const code = params.get("code") ?? "";
  const fixture = fakeGoogleFixtureForCode(code);
  if (!fixture) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  const accessToken = fakeGoogleAccessTokenForFixture(fixture);
  return Response.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "openid email profile",
  });
}

export async function handleFakeGoogleRequest(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/__fake-google/")) {
    return null;
  }

  if (request.method === "GET" && url.pathname === "/__fake-google/o/oauth2/v2/auth") {
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
    const expectedRedirect = `${url.origin}/api/auth/callback/google`;
    if (redirectUri !== expectedRedirect) {
      return new Response("invalid redirect_uri", { status: 400 });
    }
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
    return Response.redirect(target.toString(), 302);
  }

  if (request.method === "POST" && url.pathname === "/__fake-google/token") {
    return handleFakeTokenRequest(request);
  }

  if (
    request.method === "GET" &&
    url.pathname === "/__fake-google/oauth2/v3/userinfo"
  ) {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const fixture = fakeGoogleFixtureForAccessToken(token);
    if (!fixture) {
      return Response.json({ error: "invalid_token" }, { status: 401 });
    }
    return Response.json(fakeGoogleProfile(fixture));
  }

  return new Response("not_found", { status: 404 });
}

export function installFakeGoogleFetch(authBaseUrl: string): void {
  const original = globalThis.fetch.bind(globalThis);
  const origin = new URL(authBaseUrl).origin;
  globalThis.fetch = async (input, init) => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    if (url.origin === origin && url.pathname.startsWith("/__fake-google/")) {
      const response = await handleFakeGoogleRequest(new Request(url, init));
      if (response) {
        return response;
      }
      return new Response("not_found", { status: 404 });
    }
    return original(input as RequestInfo | URL, init);
  };
}
