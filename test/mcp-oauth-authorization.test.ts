import { describe, expect, it, vi } from "vitest";
import type { AppDependencies } from "../src/http/app.js";
import { handleRequest } from "../src/http/app.js";
import { BetterAuthPort } from "../src/adapters/node/better-auth-port.js";
import { MCP_OAUTH_CONSENT_FRAME_HEADERS } from "../src/auth/mcp-oauth/consent-frame-headers.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import {
  MCP_OAUTH_TEST_BASE,
  OTHER_CIMD_CLIENT_ID,
  OTHER_REDIRECT_URI,
  CHATGPT_CIMD_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  CookieJar,
  allowConsent,
  buildAuthorizeUrl,
  callMcpInitialize,
  completeGoogleSignIn,
  completeOAuthLoginFromAuthorizeRedirect,
  createChatGptCimdDocument,
  createMcpOAuthTestDeps,
  defaultCimdDocuments,
  denyConsent,
  exchangeAuthorizationCode,
  expectConsentFrameHeaders,
  expectMcpResourceUnauthorized,
  expectPlainFailClosedAsync,
  followAuthorizeToConsent,
  mcpRequestHeaders,
  mcpResourceUrl,
  randomPkceVerifier,
  refreshAccessToken,
  requestWithJar,
  signTestMcpAccessToken,
} from "./helpers/mcp-oauth-test-utils.js";

const AUTH_SERVER_METADATA_PATHS = [
  "/.well-known/oauth-authorization-server",
  "/api/auth/.well-known/oauth-authorization-server",
] as const;

async function runChatGptOAuthCodeFlow(deps: AppDependencies): Promise<{
  jar: CookieJar;
  verifier: string;
  tokens: Record<string, unknown>;
  redirect: URL;
}> {
  const jar = new CookieJar();
  await completeGoogleSignIn(deps, jar, "allowed");
  const verifier = randomPkceVerifier();
  const resource = mcpResourceUrl();
  const consentGet = await followAuthorizeToConsent(
    deps,
    jar,
    buildAuthorizeUrl({
      clientId: CHATGPT_CIMD_CLIENT_ID,
      redirectUri: CHATGPT_REDIRECT_URI,
      verifier,
      resource,
      state: "chatgpt-state",
    }),
  );
  expect(consentGet.status).toBe(403);
  expectConsentFrameHeaders(consentGet);
  await expectPlainFailClosedAsync(consentGet);
  const redirect = await allowConsent(deps, jar);
  expect(redirect.searchParams.get("code")).toBeTruthy();
  expect(redirect.searchParams.get("iss")).toBe(`${MCP_OAUTH_TEST_BASE}/api/auth`);
  expect(redirect.searchParams.get("state")).toBe("chatgpt-state");
  const tokens = await exchangeAuthorizationCode({
    deps,
    code: redirect.searchParams.get("code")!,
    verifier,
    clientId: CHATGPT_CIMD_CLIENT_ID,
    redirectUri: CHATGPT_REDIRECT_URI,
    resource,
  });
  return { jar, verifier, tokens, redirect };
}

describe("MCP OAuth authorization (DIDI-1043)", () => {
  describe("ChatGPT CIMD authorization code flow", () => {
    it("runs S256 PKCE, consent, token exchange, refresh, and MCP initialize", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const { jar, tokens } = await runChatGptOAuthCodeFlow(deps);
      expect(jar.header()).toContain("better-auth.session_token=");
      const accessToken = String(tokens.access_token);
      expect(accessToken.split(".")).toHaveLength(3);
      const mcp = await callMcpInitialize(deps, accessToken);
      expect(mcp.status).toBe(200);
      const refreshed = await refreshAccessToken({
        deps,
        refreshToken: String(tokens.refresh_token),
        clientId: CHATGPT_CIMD_CLIENT_ID,
        resource: mcpResourceUrl(),
      });
      expect(refreshed.access_token).toBeTruthy();
    });

    it("mutation: skipping resource on authorize would not bind MCP audience", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const verifier = randomPkceVerifier();
      const consentGet = await followAuthorizeToConsent(
        deps,
        jar,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier,
        }),
      );
      expect(consentGet.status).toBe(403);
      const redirect = await allowConsent(deps, jar);
      const tokens = await exchangeAuthorizationCode({
        deps,
        code: redirect.searchParams.get("code")!,
        verifier,
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
      });
      const opaque = String(tokens.access_token);
      expect(opaque.includes(".")).toBe(false);
      const mcp = await callMcpInitialize(deps, opaque);
      expect(mcp.status).toBe(401);
      expect(mcp.headers.get("www-authenticate")?.toLowerCase()).toContain("bearer");
    });
  });

  describe("dynamic client registration", () => {
    it("returns client_secret for confidential clients when the practitioner is signed in", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/api/auth/oauth2/register`,
        deps,
        jar,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            client_name: "Confidential MCP client",
            redirect_uris: ["https://confidential.example/oauth/callback"],
            token_endpoint_auth_method: "client_secret_basic",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            scope: "openid profile email offline_access",
          }),
        },
      );
      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        client_id?: string;
        client_secret?: string;
      };
      expect(payload.client_id).toBeTruthy();
      expect(payload.client_secret).toMatch(/^[A-Za-z0-9]+$/);
    });
  });

  describe("OAuth discovery metadata", () => {
    it("advertises S256 PKCE and authorization_response iss support", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      for (const path of AUTH_SERVER_METADATA_PATHS) {
        const response = await handleRequest(
          new Request(`${MCP_OAUTH_TEST_BASE}${path}`),
          deps,
        );
        expect(response.status).toBe(200);
        const metadata = (await response.json()) as Record<string, unknown>;
        expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
        expect(metadata.authorization_response_iss_parameter_supported).toBe(true);
      }
      const resourceMetadata = await handleRequest(
        new Request(`${MCP_OAUTH_TEST_BASE}/.well-known/oauth-protected-resource`),
        deps,
      );
      expect(resourceMetadata.status).toBe(200);
      await expect(resourceMetadata.json()).resolves.toMatchObject({
        resource: mcpResourceUrl(),
      });
    });

    it("forwards only allowlisted root /.well-known paths", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const port = deps.auth;
      if (!(port instanceof BetterAuthPort)) {
        throw new Error("expected BetterAuthPort");
      }
      const auth = port.getBetterAuthRuntime();
      const handlerSpy = vi.spyOn(auth, "handler");

      const disallowed = [
        "/.well-known/openid-configuration",
        "/.well-known/jwks.json",
        "/.well-known/foo",
        "/.well-known/oauth-protected-resource/other",
      ];
      for (const path of disallowed) {
        handlerSpy.mockClear();
        const response = await handleRequest(
          new Request(`${MCP_OAUTH_TEST_BASE}${path}`),
          deps,
        );
        expect(response.status).toBe(404);
        expect(handlerSpy).not.toHaveBeenCalled();
      }

      const handlerAllowed = [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
      ];
      for (const path of handlerAllowed) {
        handlerSpy.mockClear();
        const response = await handleRequest(
          new Request(`${MCP_OAUTH_TEST_BASE}${path}`),
          deps,
        );
        expect(response.status).toBe(200);
        expect(handlerSpy).toHaveBeenCalledTimes(1);
      }

      handlerSpy.mockClear();
      const authServer = await handleRequest(
        new Request(`${MCP_OAUTH_TEST_BASE}/.well-known/oauth-authorization-server`),
        deps,
      );
      expect(authServer.status).toBe(200);
      expect(handlerSpy).not.toHaveBeenCalled();

      handlerSpy.mockRestore();
    });
  });

  describe("/mcp bearer enforcement", () => {
    it("returns 401 with WWW-Authenticate for missing tokens", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const response = await handleRequest(
        new Request(`${MCP_OAUTH_TEST_BASE}/mcp`, {
          method: "POST",
          headers: mcpRequestHeaders(),
          body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
        }),
        deps,
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")?.toLowerCase()).toContain(
        "bearer",
      );
    });

    it("rejects expired JWT access tokens", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const { tokens } = await runChatGptOAuthCodeFlow(deps);
      const [header, payloadPart, signature] = String(tokens.access_token).split(".");
      const body = JSON.parse(
        Buffer.from(payloadPart!, "base64url").toString("utf8"),
      ) as {
        exp?: number;
      };
      body.exp = Math.floor(Date.now() / 1000) - 3600;
      const forgedPayload = Buffer.from(JSON.stringify(body)).toString("base64url");
      const forged = `${header}.${forgedPayload}.${signature}`;
      const response = await callMcpInitialize(deps, forged);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBeTruthy();
    });

    it("rejects wrong-audience JWT access tokens", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const { tokens } = await runChatGptOAuthCodeFlow(deps);
      const [header, payloadPart, signature] = String(tokens.access_token).split(".");
      const body = JSON.parse(
        Buffer.from(payloadPart!, "base64url").toString("utf8"),
      ) as {
        aud?: string | string[];
      };
      body.aud = ["https://wrong.example/mcp"];
      const forgedPayload = Buffer.from(JSON.stringify(body)).toString("base64url");
      const forged = `${header}.${forgedPayload}.${signature}`;
      const response = await callMcpInitialize(deps, forged);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBeTruthy();
    });

    it("rejects tokens whose Better Auth session was destroyed (revoked)", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const { jar, tokens } = await runChatGptOAuthCodeFlow(deps);
      const accessToken = String(tokens.access_token);
      const payload = JSON.parse(
        Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8"),
      ) as { sid?: string };
      expect(payload.sid).toBeTruthy();
      await deps.sql.run('DELETE FROM "session" WHERE id = ?', [payload.sid!]);
      const stillSignedIn = await deps.auth.getPractitioner(
        new Request(`${MCP_OAUTH_TEST_BASE}/`, { headers: { cookie: jar.header() } }),
      );
      expect(stillSignedIn).toBeNull();
      const response = await callMcpInitialize(deps, accessToken);
      expectMcpResourceUnauthorized(response);
    });

    it("rejects JWT access tokens with no sid claim", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const { tokens } = await runChatGptOAuthCodeFlow(deps);
      const payload = JSON.parse(
        Buffer.from(String(tokens.access_token).split(".")[1]!, "base64url").toString(
          "utf8",
        ),
      ) as Record<string, unknown>;
      delete payload.sid;
      const token = await signTestMcpAccessToken(deps, payload);
      const response = await callMcpInitialize(deps, token);
      expectMcpResourceUnauthorized(response);
    });

    it("rejects JWT access tokens whose sid is unknown", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const { tokens } = await runChatGptOAuthCodeFlow(deps);
      const payload = JSON.parse(
        Buffer.from(String(tokens.access_token).split(".")[1]!, "base64url").toString(
          "utf8",
        ),
      ) as Record<string, unknown>;
      payload.sid = generateOpaqueEntityId();
      const token = await signTestMcpAccessToken(deps, payload);
      const response = await callMcpInitialize(deps, token);
      expectMcpResourceUnauthorized(response);
    });
  });

  describe("consent UI routes", () => {
    it("requires consent again for a second client", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const verifierA = randomPkceVerifier();
      await followAuthorizeToConsent(
        deps,
        jar,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier: verifierA,
          resource: mcpResourceUrl(),
        }),
      );
      await allowConsent(deps, jar);
      const verifierB = randomPkceVerifier();
      const secondConsent = await followAuthorizeToConsent(
        deps,
        jar,
        buildAuthorizeUrl({
          clientId: OTHER_CIMD_CLIENT_ID,
          redirectUri: OTHER_REDIRECT_URI,
          verifier: verifierB,
          resource: mcpResourceUrl(),
          state: "other-client",
        }),
      );
      expect(secondConsent.status).toBe(403);
      expectConsentFrameHeaders(secondConsent);
    });

    it("deny returns access_denied to the client redirect URI", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const verifier = randomPkceVerifier();
      await followAuthorizeToConsent(
        deps,
        jar,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier,
          resource: mcpResourceUrl(),
        }),
      );
      const redirect = await denyConsent(deps, jar);
      expect(redirect.hostname).toBe("chatgpt.com");
      expect(redirect.searchParams.get("error")).toBe("access_denied");
      expect(redirect.searchParams.get("code")).toBeNull();
    });

    it("refuses allow/deny without CSRF or pending cookies", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const sessionJar = new CookieJar();
      await completeGoogleSignIn(deps, sessionJar);
      const allow = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        sessionJar,
        { method: "POST" },
      );
      expect(allow.status).toBe(403);
      expectConsentFrameHeaders(allow);
      await expectPlainFailClosedAsync(allow);
      const deny = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
        deps,
        sessionJar,
        { method: "POST" },
      );
      expect(deny.status).toBe(403);
      expectConsentFrameHeaders(deny);
      await expectPlainFailClosedAsync(deny);
    });

    it("GET consent fails closed with plain 403 and frame headers", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const response = await handleRequest(
        new Request(`${MCP_OAUTH_TEST_BASE}/oauth/consent`),
        deps,
      );
      expect(response.status).toBe(401);
      expectConsentFrameHeaders(response);
      await expectPlainFailClosedAsync(response);
    });

    it("mutation: emitting HTML on consent GET would not leave an empty body", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const consent = await followAuthorizeToConsent(
        deps,
        jar,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier: randomPkceVerifier(),
          resource: mcpResourceUrl(),
        }),
      );
      expect(consent.status).toBe(403);
      await expectPlainFailClosedAsync(consent);
    });

    it("mutation: weakening consent frame headers would fail literal expectations", () => {
      const weakened = new Response(null, {
        headers: {
          "Content-Security-Policy": "frame-ancestors 'self'",
          "X-Frame-Options": "SAMEORIGIN",
        },
      });
      expect(() => expectConsentFrameHeaders(weakened)).toThrow();
      expect(MCP_OAUTH_CONSENT_FRAME_HEADERS["Content-Security-Policy"]).toContain(
        "frame-ancestors 'none'",
      );
      expect(MCP_OAUTH_CONSENT_FRAME_HEADERS["X-Frame-Options"]).toBe("DENY");
    });
  });

  describe("repeat authorization for the same client", () => {
    it("still redirects to /oauth/consent when physio_mcp_practitioner_consent exists", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const verifier = randomPkceVerifier();
      await followAuthorizeToConsent(
        deps,
        jar,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier,
          resource: mcpResourceUrl(),
        }),
      );
      await allowConsent(deps, jar);
      const row = await deps.sql.first<{ c: number }>(
        "SELECT count(*) as c FROM physio_mcp_practitioner_consent WHERE client_id = ?",
        [CHATGPT_CIMD_CLIENT_ID],
      );
      expect(row?.c).toBe(1);
      const second = await requestWithJar(
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier: randomPkceVerifier(),
          resource: mcpResourceUrl(),
        }).toString(),
        deps,
        jar,
        { redirect: "manual" },
      );
      expect(second.status).toBe(302);
      expect(second.headers.get("location")).toContain("/oauth/consent");
    });
  });

  describe("Google allowlist during OAuth login", () => {
    it("never redirects to the client with an authorization code for refused Google accounts", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      const verifier = randomPkceVerifier();
      const authorize = await requestWithJar(
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier,
          resource: mcpResourceUrl(),
        }).toString(),
        deps,
        jar,
        { redirect: "manual" },
      );
      const loginLocation = authorize.headers.get("location");
      expect(loginLocation).toContain("/api/auth/sign-in/social");
      await completeOAuthLoginFromAuthorizeRedirect(
        deps,
        jar,
        loginLocation!,
        "refused",
      );
      const locations: string[] = [];
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/api/auth/oauth-error?error=not_allowed`,
        deps,
        jar,
      );
      locations.push(response.url);
      expect(
        locations.some(
          (loc) =>
            loc.startsWith(CHATGPT_REDIRECT_URI) &&
            new URL(loc).searchParams.has("code"),
        ),
      ).toBe(false);
    });
  });

  describe("authorize request validation", () => {
    it("rejects plain PKCE and missing PKCE", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const verifier = randomPkceVerifier();
      const plain = await requestWithJar(
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier,
          codeChallengeMethod: "plain",
          resource: mcpResourceUrl(),
        }).toString(),
        deps,
        jar,
        { redirect: "manual" },
      );
      expect(plain.status).toBe(302);
      const plainRedirect = new URL(plain.headers.get("location")!);
      expect(plainRedirect.searchParams.get("error")).toBe("invalid_request");

      const missing = await requestWithJar(
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier,
          omitPkce: true,
          resource: mcpResourceUrl(),
        }).toString(),
        deps,
        jar,
        { redirect: "manual" },
      );
      expect(missing.status).toBe(302);
      expect(new URL(missing.headers.get("location")!).searchParams.get("error")).toBe(
        "invalid_request",
      );
    });

    it("does not redirect on invalid client_id or redirect_uri", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const verifier = randomPkceVerifier();
      const badClient = await requestWithJar(
        buildAuthorizeUrl({
          clientId: "https://127.0.0.1/oauth/client.json",
          redirectUri: "https://127.0.0.1/cb",
          verifier,
          resource: mcpResourceUrl(),
        }).toString(),
        deps,
        jar,
        { redirect: "manual" },
      );
      expect(badClient.status).toBe(400);
      expect(badClient.headers.get("location")).toBeNull();

      const hostMismatch = await requestWithJar(
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: "https://evil.example/callback",
          verifier,
          resource: mcpResourceUrl(),
        }).toString(),
        deps,
        jar,
        { redirect: "manual" },
      );
      expect(hostMismatch.status).toBe(302);
      const mismatchLocation = hostMismatch.headers.get("location") ?? "";
      expect(mismatchLocation).not.toContain("code=");
      expect(mismatchLocation).toContain("/api/auth/oauth-error");
      expect(mismatchLocation).not.toMatch(/^https:\/\/evil\.example/);
    });

    it("mutation: accepting host-mismatched redirect_uri would skip 400", async () => {
      const mismatchedDoc = {
        ...createChatGptCimdDocument(),
        redirect_uris: ["https://evil.example/callback"],
      };
      const deps = await createMcpOAuthTestDeps({
        [CHATGPT_CIMD_CLIENT_ID]: mismatchedDoc,
      });
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const response = await requestWithJar(
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: "https://evil.example/callback",
          verifier: randomPkceVerifier(),
          resource: mcpResourceUrl(),
        }).toString(),
        deps,
        jar,
        { redirect: "manual" },
      );
      expect(response.status).toBe(400);
    });
  });

  describe("pending consent expiry", () => {
    const pendingConsentTtlMs = 10 * 60 * 1000;

    it("accepts allow at nine minutes fifty-nine seconds and rejects at ten minutes", async () => {
      let nowMs = 1_700_000_000_000;
      const clock = { nowMs: () => nowMs };
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
        consentClock: clock,
      });
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const verifier = randomPkceVerifier();
      await followAuthorizeToConsent(
        deps,
        jar,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier,
          resource: mcpResourceUrl(),
        }),
      );
      nowMs += pendingConsentTtlMs - 1000;
      const redirect = await allowConsent(deps, jar);
      expect(redirect.searchParams.get("code")).toBeTruthy();

      nowMs = 1_700_000_000_000;
      const jarLate = new CookieJar();
      await completeGoogleSignIn(deps, jarLate);
      await followAuthorizeToConsent(
        deps,
        jarLate,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier: randomPkceVerifier(),
          resource: mcpResourceUrl(),
        }),
      );
      nowMs += pendingConsentTtlMs;
      const expiredAllow = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jarLate,
        { method: "POST" },
      );
      expect(expiredAllow.status).toBe(403);
      expectConsentFrameHeaders(expiredAllow);
      await expectPlainFailClosedAsync(expiredAllow);
    });

    it("mutation: eleven-minute pending TTL would accept allow after ten minutes", async () => {
      let nowMs = 1_800_000_000_000;
      const clock = { nowMs: () => nowMs };
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
        consentClock: clock,
      });
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      await followAuthorizeToConsent(
        deps,
        jar,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier: randomPkceVerifier(),
          resource: mcpResourceUrl(),
        }),
      );
      nowMs += pendingConsentTtlMs + 1;
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jar,
        { method: "POST" },
      );
      expect(response.status).toBe(403);
    });

    it("refuses reusing a consumed pending consent allow", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      await followAuthorizeToConsent(
        deps,
        jar,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier: randomPkceVerifier(),
          resource: mcpResourceUrl(),
        }),
      );
      await allowConsent(deps, jar);
      const reuse = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jar,
        { method: "POST" },
      );
      expect(reuse.status).toBe(403);
      expectConsentFrameHeaders(reuse);
      await expectPlainFailClosedAsync(reuse);
    });
  });
});
