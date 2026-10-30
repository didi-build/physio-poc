import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { describe, expect, it, vi } from "vitest";
import { BetterAuthPort } from "../src/adapters/node/better-auth-port.js";
import * as sanitizeClientName from "../src/auth/mcp-oauth/sanitize-client-name.js";
import { handlePhysioMcpConsentRoutes } from "../src/auth/mcp-oauth/consent-routes.js";
import { PHYSIO_MCP_OAUTH_BETTER_AUTH_CONSENT_PATH } from "../src/auth/mcp-oauth/paths.js";
import {
  FAKE_GOOGLE_ALLOWED_B_EMAIL,
  FAKE_GOOGLE_ALLOWED_EMAIL,
} from "../src/auth/fake-google-http.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { resolveBetterAuthSecretForRuntime } from "../src/http/config.js";
import type { AppDependencies } from "../src/http/app.js";
import {
  PHYSIO_MCP_CONSENT_CSRF_COOKIE,
  PHYSIO_MCP_CONSENT_CSRF_HEADER,
} from "../src/auth/mcp-oauth/consent-crypto.js";
import {
  CHATGPT_CIMD_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  CookieJar,
  MCP_OAUTH_TEST_BASE,
  allowConsent,
  buildAuthorizeUrl,
  callMcpInitialize,
  completeGoogleSignIn,
  createChatGptCimdDocument,
  createMcpOAuthTestDeps,
  defaultCimdDocuments,
  exchangeAuthorizationCode,
  expectConsentFrameHeaders,
  expectPlainFailClosedAsync,
  followAuthorizeToConsent,
  mcpResourceUrl,
  randomPkceVerifier,
  requestWithJar,
  signTestMcpAccessToken,
} from "./helpers/mcp-oauth-test-utils.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

const MALICIOUS_CLIENT_NAME = "Evil\u0007\u2066Name";

async function countPractitionerConsentAudit(deps: AppDependencies): Promise<number> {
  const row = await deps.sql.first(
    "SELECT count(*) as c FROM physio_mcp_practitioner_consent",
  );
  return Number(row?.c ?? 0);
}

async function countPendingConsent(deps: AppDependencies): Promise<number> {
  const row = await deps.sql.first(
    "SELECT count(*) as c FROM physio_mcp_pending_consent",
  );
  return Number(row?.c ?? 0);
}

async function countUnconsumedPending(deps: AppDependencies): Promise<number> {
  const row = await deps.sql.first(
    "SELECT count(*) as c FROM physio_mcp_pending_consent WHERE consumed_at_ms IS NULL",
  );
  return Number(row?.c ?? 0);
}

async function setupConsentPending(
  deps: Awaited<ReturnType<typeof createMcpOAuthTestDeps>>,
  jar: CookieJar,
): Promise<string> {
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
  const pendingId = jar.get("physio_mcp_pending_consent_id");
  expect(pendingId).toBeTruthy();
  return pendingId!;
}

function oauthQueryFromAuthorizeRedirect(location: string): string {
  const url = new URL(location, MCP_OAUTH_TEST_BASE);
  const query = url.searchParams.toString();
  expect(query.length).toBeGreaterThan(0);
  return query;
}

async function seedTwoPractitioners(
  deps: Awaited<ReturnType<typeof createMcpOAuthTestDeps>>,
) {
  await deps.sql.run(
    "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
    [generateOpaqueEntityId(), FAKE_GOOGLE_ALLOWED_B_EMAIL, "2026-01-01T00:00:00.000Z"],
  );
}

describe("MCP OAuth consent security (DIDI-1043 QA)", () => {
  describe("Better Auth consent bypass", () => {
    it("refuses external POST to Better Auth oauth2/consent with no audit row", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const authorize = await requestWithJar(
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
      const consentLocation = authorize.headers.get("location");
      expect(consentLocation).toContain("/oauth/consent");
      const oauthQuery = oauthQueryFromAuthorizeRedirect(consentLocation!);
      const auditBefore = await countPractitionerConsentAudit(deps);
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}${PHYSIO_MCP_OAUTH_BETTER_AUTH_CONSENT_PATH}`,
        deps,
        jar,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: new URL(MCP_OAUTH_TEST_BASE).origin,
          },
          body: JSON.stringify({ accept: true, oauth_query: oauthQuery }),
        },
      );
      expect(response.status).toBe(403);
      await expectPlainFailClosedAsync(response);
      expect(await countPractitionerConsentAudit(deps)).toBe(auditBefore);
      const payload = await response.clone().text();
      expect(payload).not.toMatch(/"code"\s*:/);
    });

    it("control: unblocked Better Auth consent POST succeeds without Physio pending", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const authorize = await requestWithJar(
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
      const oauthQuery = oauthQueryFromAuthorizeRedirect(
        authorize.headers.get("location")!,
      );
      const port = deps.auth;
      if (!(port instanceof BetterAuthPort)) {
        throw new Error("expected BetterAuthPort");
      }
      const auth = port.getBetterAuthRuntime();
      const bypass = await auth.handler(
        new Request(
          `${MCP_OAUTH_TEST_BASE}${PHYSIO_MCP_OAUTH_BETTER_AUTH_CONSENT_PATH}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: jar.header(),
              origin: new URL(MCP_OAUTH_TEST_BASE).origin,
            },
            body: JSON.stringify({ accept: true, oauth_query: oauthQuery }),
          },
        ),
      );
      expect(bypass.ok).toBe(true);
      const json = (await bypass.json()) as { redirect?: boolean; url?: string };
      expect(json.redirect).toBe(true);
      expect(json.url).toContain("code=");
    });
  });

  describe("practitioner binding on pending consent", () => {
    it("refuses allow when practitioner B reuses A pending cookies", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
        allowedEmails: `${FAKE_GOOGLE_ALLOWED_EMAIL},${FAKE_GOOGLE_ALLOWED_B_EMAIL}`,
      });
      await seedTwoPractitioners(deps);
      const jarA = new CookieJar();
      await completeGoogleSignIn(deps, jarA, "allowed");
      await followAuthorizeToConsent(
        deps,
        jarA,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier: randomPkceVerifier(),
          resource: mcpResourceUrl(),
        }),
      );
      const stolenPending = jarA.get("physio_mcp_pending_consent_id");
      const stolenCsrf = jarA.get("physio_mcp_consent_csrf");
      expect(stolenPending).toBeTruthy();
      expect(stolenCsrf).toBeTruthy();

      const jarB = new CookieJar();
      await completeGoogleSignIn(deps, jarB, "allowed-b");
      jarB.absorb(
        new Response(null, {
          headers: {
            "Set-Cookie": `physio_mcp_pending_consent_id=${stolenPending}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          },
        }),
      );
      jarB.absorb(
        new Response(null, {
          headers: {
            "Set-Cookie": `physio_mcp_consent_csrf=${stolenCsrf}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          },
        }),
      );

      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jarB,
        { method: "POST" },
      );
      expect(response.status).toBe(403);
      expectConsentFrameHeaders(response);
      await expectPlainFailClosedAsync(response);
      expect(await countPractitionerConsentAudit(deps)).toBe(0);
    });

    it("control: cross-practitioner allow stays blocked when ownership check is present", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
        allowedEmails: `${FAKE_GOOGLE_ALLOWED_EMAIL},${FAKE_GOOGLE_ALLOWED_B_EMAIL}`,
      });
      await seedTwoPractitioners(deps);
      const jarA = new CookieJar();
      await completeGoogleSignIn(deps, jarA, "allowed");
      await followAuthorizeToConsent(
        deps,
        jarA,
        buildAuthorizeUrl({
          clientId: CHATGPT_CIMD_CLIENT_ID,
          redirectUri: CHATGPT_REDIRECT_URI,
          verifier: randomPkceVerifier(),
          resource: mcpResourceUrl(),
        }),
      );
      const stolenPending = jarA.get("physio_mcp_pending_consent_id");
      const stolenCsrf = jarA.get("physio_mcp_consent_csrf");
      const jarB = new CookieJar();
      await completeGoogleSignIn(deps, jarB, "allowed-b");
      jarB.absorb(
        new Response(null, {
          headers: {
            "Set-Cookie": `physio_mcp_pending_consent_id=${stolenPending}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          },
        }),
      );
      jarB.absorb(
        new Response(null, {
          headers: {
            "Set-Cookie": `physio_mcp_consent_csrf=${stolenCsrf}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          },
        }),
      );
      const port = deps.auth;
      if (!(port instanceof BetterAuthPort)) {
        throw new Error("expected BetterAuthPort");
      }
      const authSpy = vi.spyOn(port.getBetterAuthRuntime(), "handler");
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jarB,
        { method: "POST" },
      );
      authSpy.mockRestore();
      expect(response.status).toBe(403);
      if (response.status === 302) {
        throw new Error(
          "mutant: cross-practitioner allow succeeded without ownership check",
        );
      }
    });
  });

  describe("CSRF and Origin on allow/deny", () => {
    it("refuses allow when CSRF header matches cookie but pending csrf_token_hash does not", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      const pendingId = await setupConsentPending(deps, jar);
      const mismatchedToken = "cccccccccccccccccccccccccccccccc";
      jar.set(PHYSIO_MCP_CONSENT_CSRF_COOKIE, mismatchedToken);
      const auditBefore = await countPractitionerConsentAudit(deps);
      const unconsumedBefore = await countUnconsumedPending(deps);
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jar,
        {
          method: "POST",
          headers: {
            [PHYSIO_MCP_CONSENT_CSRF_HEADER]: mismatchedToken,
            origin: new URL(MCP_OAUTH_TEST_BASE).origin,
          },
        },
      );
      expect(response.status).toBe(403);
      expectConsentFrameHeaders(response);
      await expectPlainFailClosedAsync(response);
      expect(await countPractitionerConsentAudit(deps)).toBe(auditBefore);
      expect(await countUnconsumedPending(deps)).toBe(unconsumedBefore);
      const row = await deps.sql.first<{ consumed_at_ms: number | null }>(
        "SELECT consumed_at_ms FROM physio_mcp_pending_consent WHERE id = ?",
        [pendingId],
      );
      expect(row?.consumed_at_ms).toBeNull();
    });

    it("refuses allow when CSRF header does not match cookie", async () => {
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
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jar,
        {
          method: "POST",
          headers: {
            [PHYSIO_MCP_CONSENT_CSRF_HEADER]: "deadbeefdeadbeefdeadbeefdeadbeef",
            origin: new URL(MCP_OAUTH_TEST_BASE).origin,
          },
        },
      );
      expect(response.status).toBe(403);
      expectConsentFrameHeaders(response);
      await expectPlainFailClosedAsync(response);
    });

    it("refuses allow when Origin header is missing", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await setupConsentPending(deps, jar);
      const csrf = jar.get(PHYSIO_MCP_CONSENT_CSRF_COOKIE);
      const auditBefore = await countPractitionerConsentAudit(deps);
      const unconsumedBefore = await countUnconsumedPending(deps);
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jar,
        {
          method: "POST",
          headers: {
            [PHYSIO_MCP_CONSENT_CSRF_HEADER]: csrf ?? "",
          },
        },
        { omitOrigin: true },
      );
      expect(response.status).toBe(403);
      expectConsentFrameHeaders(response);
      await expectPlainFailClosedAsync(response);
      expect(await countPractitionerConsentAudit(deps)).toBe(auditBefore);
      expect(await countUnconsumedPending(deps)).toBe(unconsumedBefore);
    });

    it("refuses deny when Origin header is missing", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await setupConsentPending(deps, jar);
      const csrf = jar.get(PHYSIO_MCP_CONSENT_CSRF_COOKIE);
      const auditBefore = await countPractitionerConsentAudit(deps);
      const unconsumedBefore = await countUnconsumedPending(deps);
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
        deps,
        jar,
        {
          method: "POST",
          headers: {
            [PHYSIO_MCP_CONSENT_CSRF_HEADER]: csrf ?? "",
          },
        },
        { omitOrigin: true },
      );
      expect(response.status).toBe(403);
      expectConsentFrameHeaders(response);
      await expectPlainFailClosedAsync(response);
      expect(await countPractitionerConsentAudit(deps)).toBe(auditBefore);
      expect(await countUnconsumedPending(deps)).toBe(unconsumedBefore);
    });

    it("refuses allow on cross-origin POST", async () => {
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
      const csrf = jar.get("physio_mcp_consent_csrf");
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jar,
        {
          method: "POST",
          headers: {
            [PHYSIO_MCP_CONSENT_CSRF_HEADER]: csrf ?? "",
            origin: "https://evil.example",
          },
        },
      );
      expect(response.status).toBe(403);
      expectConsentFrameHeaders(response);
      await expectPlainFailClosedAsync(response);
    });

    it("refuses deny on cross-origin POST", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await setupConsentPending(deps, jar);
      const csrf = jar.get(PHYSIO_MCP_CONSENT_CSRF_COOKIE);
      const auditBefore = await countPractitionerConsentAudit(deps);
      const unconsumedBefore = await countUnconsumedPending(deps);
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
        deps,
        jar,
        {
          method: "POST",
          headers: {
            [PHYSIO_MCP_CONSENT_CSRF_HEADER]: csrf ?? "",
            origin: "https://evil.example",
          },
        },
      );
      expect(response.status).toBe(403);
      expectConsentFrameHeaders(response);
      await expectPlainFailClosedAsync(response);
      expect(await countPractitionerConsentAudit(deps)).toBe(auditBefore);
      expect(await countUnconsumedPending(deps)).toBe(unconsumedBefore);
    });

    it("control: wrong CSRF header stays blocked when header comparison is present", async () => {
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
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jar,
        {
          method: "POST",
          headers: {
            [PHYSIO_MCP_CONSENT_CSRF_HEADER]: "deadbeefdeadbeefdeadbeefdeadbeef",
            origin: new URL(MCP_OAUTH_TEST_BASE).origin,
          },
        },
      );
      expect(response.status).toBe(403);
      if (response.status === 302) {
        throw new Error("mutant: wrong CSRF header was accepted");
      }
    });

    it("control: cross-origin allow stays blocked when Origin check is present", async () => {
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
      const csrf = jar.get("physio_mcp_consent_csrf");
      const response = await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jar,
        {
          method: "POST",
          headers: {
            [PHYSIO_MCP_CONSENT_CSRF_HEADER]: csrf ?? "",
            origin: "https://evil.example",
          },
        },
      );
      expect(response.status).toBe(403);
      if (response.status === 302) {
        throw new Error("mutant: cross-origin allow succeeded without Origin check");
      }
    });
  });

  describe("signed consent query on GET", () => {
    it("refuses tampered oauth query with no pending row", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const authorize = await requestWithJar(
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
      const consentUrl = new URL(
        authorize.headers.get("location")!,
        MCP_OAUTH_TEST_BASE,
      );
      consentUrl.searchParams.set("state", "tampered-state");
      const pendingBefore = await countPendingConsent(deps);
      const response = await requestWithJar(consentUrl.toString(), deps, jar, {
        redirect: "manual",
      });
      expect(response.status).toBe(403);
      expectConsentFrameHeaders(response);
      await expectPlainFailClosedAsync(response);
      expect(await countPendingConsent(deps)).toBe(pendingBefore);
    });

    it("control: tampered consent GET inserts pending when oauth query verify is always true", async () => {
      const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      const authorize = await requestWithJar(
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
      const consentUrl = new URL(
        authorize.headers.get("location")!,
        MCP_OAUTH_TEST_BASE,
      );
      consentUrl.searchParams.set("state", "tampered-state");
      const port = deps.auth;
      if (!(port instanceof BetterAuthPort)) {
        throw new Error("expected BetterAuthPort");
      }
      const practitioner = await port.getPractitioner(
        new Request(MCP_OAUTH_TEST_BASE, { headers: { cookie: jar.header() } }),
      );
      expect(practitioner).toBeTruthy();
      const pendingBefore = await countPendingConsent(deps);
      const response = await handlePhysioMcpConsentRoutes({
        request: new Request(consentUrl.toString(), {
          headers: { cookie: jar.header() },
        }),
        pathname: consentUrl.pathname,
        auth: port.getBetterAuthRuntime(),
        sql: deps.sql,
        authBaseUrl: MCP_OAUTH_TEST_BASE,
        authSecret: resolveBetterAuthSecretForRuntime(PHYSIO_TEST_BETTER_AUTH_SECRET),
        practitioner,
        verifyOAuthQueryParams: async () => true,
      });
      expect(response?.status).toBe(403);
      expect(await countPendingConsent(deps)).toBeGreaterThan(pendingBefore);
      expect(verifyOAuthQueryParams).toBeDefined();
    });
  });

  describe("JWT expiry and audience (signTestMcpAccessToken)", () => {
    it("control: unsigned JWT payload tampering does not bypass expiry verification", async () => {
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
      const redirect = await allowConsent(deps, jar);
      const tokens = await exchangeAuthorizationCode({
        deps,
        code: redirect.searchParams.get("code")!,
        verifier,
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        resource: mcpResourceUrl(),
      });
      const payload = JSON.parse(
        Buffer.from(String(tokens.access_token).split(".")[1]!, "base64url").toString(
          "utf8",
        ),
      ) as Record<string, unknown>;
      payload.exp = Math.floor(Date.now() / 1000) - 3600;
      const signed = await signTestMcpAccessToken(deps, payload);
      const [header, payloadPart, signature] = signed.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 }),
      ).toString("base64url");
      const forged = `${header}.${tamperedPayload}.${signature}`;
      const forgedResponse = await callMcpInitialize(deps, forged);
      expect(forgedResponse.status).toBe(401);
      const resigned = await signTestMcpAccessToken(deps, {
        ...payload,
        exp: Math.floor(Date.now() / 1000) - 3600,
      });
      const resignedResponse = await callMcpInitialize(deps, resigned);
      expect(resignedResponse.status).toBe(401);
      expect(signed.split(".")).toHaveLength(3);
      expect(payloadPart).toBeTruthy();
    });
  });

  describe("CIMD client name sanitization in storage", () => {
    it("stores sanitized oauthClient.name after CIMD discovery", async () => {
      const maliciousDoc = {
        ...createChatGptCimdDocument(),
        client_name: MALICIOUS_CLIENT_NAME,
      };
      const deps = await createMcpOAuthTestDeps({
        [CHATGPT_CIMD_CLIENT_ID]: maliciousDoc,
      });
      const jar = new CookieJar();
      await completeGoogleSignIn(deps, jar);
      await requestWithJar(
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
      const row = await deps.sql.first<{ name: string | null }>(
        'SELECT name FROM "oauthClient" WHERE clientId = ? LIMIT 1',
        [CHATGPT_CIMD_CLIENT_ID],
      );
      expect(row?.name).toBeTruthy();
      expect(row!.name!).not.toContain("\u0007");
      expect(row!.name!).not.toContain("\u2066");
      expect(row!.name!).toBe("EvilName");
    });

    it("control: disabled CIMD name sanitization hook stores raw control characters", async () => {
      const sanitizeSpy = vi
        .spyOn(sanitizeClientName, "sanitizeOAuthClientDisplayName")
        .mockImplementation((name) => (typeof name === "string" ? name : "host"));
      try {
        const maliciousDoc = {
          ...createChatGptCimdDocument(),
          client_name: MALICIOUS_CLIENT_NAME,
        };
        const deps = await createMcpOAuthTestDeps({
          [CHATGPT_CIMD_CLIENT_ID]: maliciousDoc,
        });
        const jar = new CookieJar();
        await completeGoogleSignIn(deps, jar);
        await requestWithJar(
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
        const row = await deps.sql.first<{ name: string | null }>(
          'SELECT name FROM "oauthClient" WHERE clientId = ? LIMIT 1',
          [CHATGPT_CIMD_CLIENT_ID],
        );
        expect(row?.name).toContain("\u0007");
      } finally {
        sanitizeSpy.mockRestore();
      }
    });
  });
});
