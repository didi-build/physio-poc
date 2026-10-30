import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { createHash, randomBytes } from "node:crypto";
import { expect } from "vitest";
import type { FakeGoogleFixture } from "../../src/auth/fake-google-http.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../../src/auth/fake-google-http.js";
import { generateOpaqueEntityId } from "../../src/domain/opaque-entity-id.js";
import { handleRequest, type AppDependencies } from "../../src/http/app.js";
import { mcpOAuthResourceUrl } from "../../src/auth/mcp-oauth/paths.js";
import { PHYSIO_MCP_OAUTH_SCOPES } from "../../src/adapters/node/physio-mcp-oauth-plugins.js";
import { createNodeAppDependencies } from "../../src/adapters/node/create-node-app-dependencies.js";
import { BetterAuthPort } from "../../src/adapters/node/better-auth-port.js";
import type { PhysioMcpConsentClock } from "../../src/auth/mcp-oauth/consent-routes.js";
import {
  PHYSIO_MCP_CONSENT_CSRF_COOKIE,
  PHYSIO_MCP_CONSENT_CSRF_HEADER,
} from "../../src/auth/mcp-oauth/consent-crypto.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./physio-test-auth-secret.js";

export const MCP_OAUTH_TEST_BASE = "http://127.0.0.1:8787";

export const CHATGPT_CIMD_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
export const CHATGPT_REDIRECT_URI =
  "https://chatgpt.com/connector_platform_oauth_redirect";

export const OTHER_CIMD_CLIENT_ID = "https://other-app.example/oauth/client.json";
export const OTHER_REDIRECT_URI = "https://other-app.example/oauth/callback";

export const MCP_OAUTH_SCOPES = [...PHYSIO_MCP_OAUTH_SCOPES].join(" ");

export function mcpResourceUrl(base = MCP_OAUTH_TEST_BASE): string {
  return mcpOAuthResourceUrl(base);
}

export function createFakeCimdMetadataFetch(
  documents: Record<string, Record<string, unknown>>,
): ClientMetadataResourceFetch {
  return async (input) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const doc = documents[url];
    if (!doc) {
      return new Response(null, { status: 404 });
    }
    return Response.json(doc);
  };
}

export function createChatGptCimdDocument(): Record<string, unknown> {
  return {
    client_id: CHATGPT_CIMD_CLIENT_ID,
    client_name: "ChatGPT",
    redirect_uris: [CHATGPT_REDIRECT_URI],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

export function createOtherAppCimdDocument(): Record<string, unknown> {
  return {
    client_id: OTHER_CIMD_CLIENT_ID,
    client_name: "Other App",
    redirect_uris: [OTHER_REDIRECT_URI],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

export function pkceS256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function randomPkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export class CookieJar {
  private readonly values = new Map<string, string>();

  absorb(response: Response): void {
    const parts =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")!]
          : [];
    for (const raw of parts) {
      for (const segment of raw.split(/,(?=\s*[^;]+=)/)) {
        const [pair] = segment.split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) {
          continue;
        }
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value.length === 0) {
          this.values.delete(name);
        } else {
          this.values.set(name, value);
        }
      }
    }
  }

  header(): string {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  get(name: string): string | undefined {
    return this.values.get(name);
  }

  set(name: string, value: string): void {
    this.values.set(name, value);
  }
}

export type RequestWithJarOptions = {
  /** Do not inject Origin on POST (consent Origin guard tests). */
  omitOrigin?: boolean;
};

export async function requestWithJar(
  url: string,
  deps: AppDependencies,
  jar: CookieJar,
  init: RequestInit = {},
  options: RequestWithJarOptions = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) {
    headers.set("cookie", cookie);
    if (
      !options.omitOrigin &&
      (init.method === "POST" || init.method === "PUT" || init.method === "PATCH") &&
      !headers.has("origin")
    ) {
      headers.set("origin", new URL(MCP_OAUTH_TEST_BASE).origin);
    }
  }
  const method = init.method ?? "GET";
  if (method === "POST") {
    const path = new URL(url, MCP_OAUTH_TEST_BASE).pathname;
    if (
      (path === "/oauth/consent/allow" || path === "/oauth/consent/deny") &&
      !headers.has(PHYSIO_MCP_CONSENT_CSRF_HEADER)
    ) {
      const csrf = jar.get(PHYSIO_MCP_CONSENT_CSRF_COOKIE);
      if (csrf) {
        headers.set(PHYSIO_MCP_CONSENT_CSRF_HEADER, csrf);
      }
    }
  }
  const response = await handleRequest(
    new Request(url, {
      ...init,
      headers,
    }),
    deps,
  );
  jar.absorb(response);
  return response;
}

export type CimdDocumentMap = Record<string, Record<string, unknown>>;

export async function createMcpOAuthTestDeps(
  cimdDocuments: CimdDocumentMap,
  options: {
    allowedEmails?: string;
    seedPractitioner?: boolean;
    consentClock?: PhysioMcpConsentClock;
  } = {},
): Promise<AppDependencies> {
  const deps = await createNodeAppDependencies(
    {
      AUTH_BASE_URL: MCP_OAUTH_TEST_BASE,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: options.allowedEmails ?? FAKE_GOOGLE_ALLOWED_EMAIL,
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    },
    {
      cimdMetadataFetch: createFakeCimdMetadataFetch(cimdDocuments),
      consentClock: options.consentClock,
    },
  );
  if (options.seedPractitioner !== false) {
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [generateOpaqueEntityId(), FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
    );
  }
  return deps;
}

export async function completeGoogleSignIn(
  deps: AppDependencies,
  jar: CookieJar,
  fixture: FakeGoogleFixture = "allowed",
): Promise<void> {
  const signIn = await requestWithJar(
    `${MCP_OAUTH_TEST_BASE}/api/auth/sign-in/social`,
    deps,
    jar,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/exercises" }),
    },
  );
  const payload = (await signIn.json()) as { url?: string };
  expect(payload.url).toBeTruthy();
  const authorizeUrl = new URL(payload.url ?? "");
  authorizeUrl.searchParams.set("fixture", fixture);
  let response = await requestWithJar(authorizeUrl.toString(), deps, jar);
  for (
    let step = 0;
    step < 8 && response.status >= 300 && response.status < 400;
    step += 1
  ) {
    const nextUrl = response.headers.get("location");
    if (!nextUrl) {
      break;
    }
    response = await requestWithJar(
      new URL(nextUrl, MCP_OAUTH_TEST_BASE).toString(),
      deps,
      jar,
    );
  }
}

export async function completeOAuthLoginFromAuthorizeRedirect(
  deps: AppDependencies,
  jar: CookieJar,
  loginLocation: string,
  fixture: FakeGoogleFixture,
): Promise<void> {
  const loginUrl = new URL(loginLocation, MCP_OAUTH_TEST_BASE);
  const signIn = await requestWithJar(loginUrl.toString(), deps, jar, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", callbackURL: "/exercises" }),
  });
  const payload = (await signIn.json()) as { url?: string };
  const googleUrl = new URL(payload.url ?? "", MCP_OAUTH_TEST_BASE);
  googleUrl.searchParams.set("fixture", fixture);
  let response = await requestWithJar(googleUrl.toString(), deps, jar, {
    redirect: "manual",
  });
  for (
    let step = 0;
    step < 12 && response.status >= 300 && response.status < 400;
    step += 1
  ) {
    const nextUrl = response.headers.get("location");
    if (!nextUrl) {
      break;
    }
    response = await requestWithJar(
      new URL(nextUrl, MCP_OAUTH_TEST_BASE).toString(),
      deps,
      jar,
      {
        redirect: "manual",
      },
    );
  }
}

export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  verifier: string;
  state?: string;
  resource?: string;
  codeChallengeMethod?: "S256" | "plain";
  omitPkce?: boolean;
};

export function buildAuthorizeUrl(params: AuthorizeParams): URL {
  const url = new URL(`${MCP_OAUTH_TEST_BASE}/api/auth/oauth2/authorize`);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", MCP_OAUTH_SCOPES);
  url.searchParams.set("state", params.state ?? "oauth-state");
  if (params.resource) {
    url.searchParams.set("resource", params.resource);
  }
  if (!params.omitPkce) {
    url.searchParams.set(
      "code_challenge",
      params.codeChallengeMethod === "plain"
        ? params.verifier
        : pkceS256Challenge(params.verifier),
    );
    url.searchParams.set("code_challenge_method", params.codeChallengeMethod ?? "S256");
  }
  return url;
}

export async function followAuthorizeToConsent(
  deps: AppDependencies,
  jar: CookieJar,
  authorizeUrl: URL,
): Promise<Response> {
  let response = await requestWithJar(authorizeUrl.toString(), deps, jar, {
    redirect: "manual",
  });
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  response = await requestWithJar(
    new URL(location!, MCP_OAUTH_TEST_BASE).toString(),
    deps,
    jar,
    {
      redirect: "manual",
    },
  );
  return response;
}

export async function allowConsent(
  deps: AppDependencies,
  jar: CookieJar,
): Promise<URL> {
  const response = await requestWithJar(
    `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
    deps,
    jar,
    { method: "POST" },
  );
  expect(response.status).toBe(302);
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return new URL(location!);
}

export async function denyConsent(deps: AppDependencies, jar: CookieJar): Promise<URL> {
  const response = await requestWithJar(
    `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
    deps,
    jar,
    { method: "POST" },
  );
  expect(response.status).toBe(302);
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return new URL(location!);
}

export async function exchangeAuthorizationCode(params: {
  deps: AppDependencies;
  code: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
  resource?: string;
  clientSecret?: string;
}): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.verifier,
  });
  if (params.resource) {
    body.set("resource", params.resource);
  }
  if (params.clientSecret) {
    body.set("client_secret", params.clientSecret);
  }
  const response = await handleRequest(
    new Request(`${MCP_OAUTH_TEST_BASE}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }),
    params.deps,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

export async function refreshAccessToken(params: {
  deps: AppDependencies;
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
  resource?: string;
}): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });
  if (params.resource) {
    body.set("resource", params.resource);
  }
  if (params.clientSecret) {
    body.set("client_secret", params.clientSecret);
  }
  const response = await handleRequest(
    new Request(`${MCP_OAUTH_TEST_BASE}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }),
    params.deps,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

export const MCP_JSONRPC_INITIALIZE_BODY = JSON.stringify({
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp-oauth-test", version: "0" },
  },
  id: 1,
});

export function mcpRequestHeaders(accessToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export async function callMcpInitialize(
  deps: AppDependencies,
  accessToken: string,
): Promise<Response> {
  return handleRequest(
    new Request(`${MCP_OAUTH_TEST_BASE}/mcp`, {
      method: "POST",
      headers: mcpRequestHeaders(accessToken),
      body: MCP_JSONRPC_INITIALIZE_BODY,
    }),
    deps,
  );
}

export function expectConsentFrameHeaders(response: Response): void {
  expect(response.headers.get("Content-Security-Policy")).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers.get("X-Frame-Options")).toBe("DENY");
}

export async function expectPlainFailClosedAsync(response: Response): Promise<void> {
  expect(await response.text()).toBe("");
}

export function expectMcpResourceUnauthorized(response: Response): void {
  expect(response.status).toBe(401);
  const header = response.headers.get("www-authenticate")?.toLowerCase() ?? "";
  expect(header).toContain("bearer");
  expect(header).toContain("resource_metadata");
}

export async function signTestMcpAccessToken(
  deps: AppDependencies,
  payload: Record<string, unknown>,
): Promise<string> {
  const port = deps.auth;
  if (!(port instanceof BetterAuthPort)) {
    throw new Error("expected BetterAuthPort");
  }
  const auth = port.getBetterAuthRuntime();
  const signJwt = (
    auth.api as unknown as {
      signJWT(input: { body: { payload: Record<string, unknown> } }): Promise<{
        token?: string;
      }>;
    }
  ).signJWT;
  const result = await signJwt({
    body: { payload },
  });
  if (!result.token) {
    throw new Error("signJWT did not return a token");
  }
  return result.token;
}

export function defaultCimdDocuments(): CimdDocumentMap {
  return {
    [CHATGPT_CIMD_CLIENT_ID]: createChatGptCimdDocument(),
    [OTHER_CIMD_CLIENT_ID]: createOtherAppCimdDocument(),
  };
}
