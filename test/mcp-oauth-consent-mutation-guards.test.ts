import { afterEach, describe, expect, it, vi } from "vitest";
import * as consentCrypto from "../src/auth/mcp-oauth/consent-crypto.js";
import * as consentRoutes from "../src/auth/mcp-oauth/consent-routes.js";
import {
  PHYSIO_MCP_CONSENT_CSRF_COOKIE,
  PHYSIO_MCP_CONSENT_CSRF_HEADER,
} from "../src/auth/mcp-oauth/consent-crypto.js";
import {
  CHATGPT_CIMD_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  CookieJar,
  MCP_OAUTH_TEST_BASE,
  buildAuthorizeUrl,
  completeGoogleSignIn,
  createMcpOAuthTestDeps,
  defaultCimdDocuments,
  followAuthorizeToConsent,
  mcpResourceUrl,
  randomPkceVerifier,
  requestWithJar,
} from "./helpers/mcp-oauth-test-utils.js";

async function preparePendingConsent(jar: CookieJar) {
  const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
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
  return deps;
}

describe("MCP OAuth consent mutation guards (DIDI-1043 QA round 2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("guard: skipping CSRF token hash check allows allow with mismatched cookie token", async () => {
    const jar = new CookieJar();
    const deps = await preparePendingConsent(jar);
    const pendingId = jar.get("physio_mcp_pending_consent_id");
    expect(pendingId).toBeTruthy();
    const row = await deps.sql.first<{ csrf_token_hash: string }>(
      "SELECT csrf_token_hash FROM physio_mcp_pending_consent WHERE id = ?",
      [pendingId!],
    );
    expect(row?.csrf_token_hash).toBeTruthy();
    const mismatchedToken = "cccccccccccccccccccccccccccccccc";
    jar.set(PHYSIO_MCP_CONSENT_CSRF_COOKIE, mismatchedToken);
    vi.spyOn(consentCrypto, "sha256Hex").mockResolvedValue(row!.csrf_token_hash);
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
    expect(response.status).toBe(302);
  });

  it("guard: skipping Origin check allows allow without Origin header", async () => {
    const jar = new CookieJar();
    const deps = await preparePendingConsent(jar);
    const csrf = jar.get(PHYSIO_MCP_CONSENT_CSRF_COOKIE);
    vi.spyOn(
      consentRoutes.physioMcpConsentOriginGuard,
      "refuseCrossOriginConsentPost",
    ).mockReturnValue(null);
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
    expect(response.status).toBe(302);
  });

  it("guard: skipping Origin check allows cross-origin deny", async () => {
    const jar = new CookieJar();
    const deps = await preparePendingConsent(jar);
    const csrf = jar.get(PHYSIO_MCP_CONSENT_CSRF_COOKIE);
    vi.spyOn(
      consentRoutes.physioMcpConsentOriginGuard,
      "refuseCrossOriginConsentPost",
    ).mockReturnValue(null);
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
    expect(response.status).toBe(302);
  });
});
