import { describe, expect, it } from "vitest";
import {
  CHATGPT_CIMD_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  CookieJar,
  MCP_OAUTH_TEST_BASE,
  allowConsent,
  buildAuthorizeUrl,
  completeGoogleSignIn,
  createChatGptCimdDocument,
  createMcpOAuthTestDeps,
  defaultCimdDocuments,
  followAuthorizeToConsent,
  mcpResourceUrl,
  randomPkceVerifier,
  requestWithJar,
} from "./helpers/mcp-oauth-test-utils.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import {
  FAKE_GOOGLE_ALLOWED_B_EMAIL,
  FAKE_GOOGLE_ALLOWED_EMAIL,
} from "../src/auth/fake-google-http.js";
import { PHYSIO_MCP_PENDING_CONSENT_TTL_MS } from "../src/auth/mcp-oauth/pending-consent.js";
import type { AppDependencies } from "../src/http/app.js";

async function seedTwoPractitioners(deps: AppDependencies) {
  await deps.sql.run(
    "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
    [generateOpaqueEntityId(), FAKE_GOOGLE_ALLOWED_B_EMAIL, "2026-01-01T00:00:00.000Z"],
  );
}

describe("MCP OAuth consent UI (DIDI-1126)", () => {
  it("renders consent copy verbatim from the spec string list", async () => {
    const deps = await createMcpOAuthTestDeps(defaultCimdDocuments());
    const jar = new CookieJar();
    await completeGoogleSignIn(deps, jar);
    const response = await followAuthorizeToConsent(
      deps,
      jar,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    const html = await response.text();
    expect(html).toContain("Connect an app · Didi Physio");
    expect(html).toContain("Didi Physio");
    expect(html).toContain("Request from ");
    expect(html).toContain("chatgpt.com");
    expect(html).toContain("Allow read-only access to Didi Physio?");
    expect(html).toContain("The app calls itself");
    expect(html).toContain("ChatGPT");
    expect(html).toContain("Self-reported");
    expect(html).toContain("It can");
    expect(html).toContain("Search your approved exercises");
    expect(html).toContain("Search your routines");
    expect(html).toContain("See your programs and their share links");
    expect(html).toContain("It can’t");
    expect(html).toContain("Create, edit, publish or delete anything");
    expect(html).toContain(
      "For changes, it sends you a link to the right page here instead",
    );
    expect(html).toContain("Didi Physio never stores or shares patient details.");
    expect(html).toContain(
      "Only allow it if you just started connecting from chatgpt.com.",
    );
    expect(html).toContain("Deny");
    expect(html).toContain("Allow");
    expect(html).toContain(`Signed in as ${FAKE_GOOGLE_ALLOWED_EMAIL}`);
    expect(html).toContain("Not you? Sign out");
  });

  it("escapes HTML in the client display name", async () => {
    const maliciousName = "<script>alert(1)</script><img src=x onerror=alert(1)>";
    const doc = {
      ...createChatGptCimdDocument(),
      client_name: maliciousName,
    };
    const deps = await createMcpOAuthTestDeps({
      [CHATGPT_CIMD_CLIENT_ID]: doc,
    });
    const jar = new CookieJar();
    await completeGoogleSignIn(deps, jar);
    const response = await followAuthorizeToConsent(
      deps,
      jar,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    const html = await response.text();
    expect(html).not.toMatch(/The app calls itself “<script>/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("requires consent again for another practitioner with the same client, redirect_uri and scopes", async () => {
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
    await allowConsent(deps, jarA);

    const jarB = new CookieJar();
    await completeGoogleSignIn(deps, jarB, "allowed-b");
    const consentB = await followAuthorizeToConsent(
      deps,
      jarB,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    expect(consentB.status).toBe(200);
    expect(await consentB.text()).toContain("Allow read-only access to Didi Physio?");
  });

  it("requires consent again when redirect_uri changes", async () => {
    const altRedirect = "https://chatgpt.com/alt-callback";
    const doc = {
      ...createChatGptCimdDocument(),
      redirect_uris: [CHATGPT_REDIRECT_URI, altRedirect],
    };
    const deps = await createMcpOAuthTestDeps({
      [CHATGPT_CIMD_CLIENT_ID]: doc,
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
    await allowConsent(deps, jar);
    const consent = await followAuthorizeToConsent(
      deps,
      jar,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: altRedirect,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    expect(consent.status).toBe(200);
  });

  it("requires consent again when the scope set changes", async () => {
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
    const narrowedScopes = "openid profile email";
    const url = buildAuthorizeUrl({
      clientId: CHATGPT_CIMD_CLIENT_ID,
      redirectUri: CHATGPT_REDIRECT_URI,
      verifier: randomPkceVerifier(),
      resource: mcpResourceUrl(),
    });
    url.searchParams.set("scope", narrowedScopes);
    const consent = await followAuthorizeToConsent(deps, jar, url);
    expect(consent.status).toBe(200);
  });

  it("shows invalid-client copy and focuses the heading when the client cannot be resolved", async () => {
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
    const consentUrl = new URL(authorize.headers.get("location")!, MCP_OAUTH_TEST_BASE);
    await deps.sql.run('DELETE FROM "oauthClient" WHERE "clientId" = ?', [
      CHATGPT_CIMD_CLIENT_ID,
    ]);
    const response = await requestWithJar(consentUrl.toString(), deps, jar);
    const html = await response.text();
    expect(html).toContain("This app can’t connect");
    expect(html).toContain(
      "The app asking to connect didn’t identify itself in a way Didi Physio accepts, so nothing was shared.",
    );
    expect(html).toContain(
      "Go back to the app and try connecting again. If it keeps happening, the app may not work with Didi Physio yet.",
    );
    expect(html).toContain("Go to Didi Physio");
    expect(html).toContain('id="invalid-heading"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('document.getElementById("invalid-heading").focus()');
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the pending request after sign-out and shows consent for the next allowlisted account", async () => {
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
    const pendingBefore = jarA.get("physio_mcp_pending_consent_id");
    expect(pendingBefore).toBeTruthy();
    const signOut = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/api/auth/sign-out`,
      deps,
      jarA,
      { method: "POST" },
    );
    expect(signOut.ok).toBe(true);
    expect(jarA.get("physio_mcp_pending_consent_id")).toBe(pendingBefore);
    const pendingRow = await deps.sql.first<{ id: string }>(
      "SELECT id FROM physio_mcp_pending_consent WHERE id = ?",
      [pendingBefore!],
    );
    expect(pendingRow?.id).toBe(pendingBefore);

    await completeGoogleSignIn(deps, jarA, "allowed-b");
    const resume = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent`,
      deps,
      jarA,
    );
    expect(resume.status).toBe(200);
    expect(await resume.text()).toContain("Allow read-only access to Didi Physio?");
  });

  it("shows the expired page after the pending TTL", async () => {
    let nowMs = 2_000_000_000_000;
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
    nowMs += PHYSIO_MCP_PENDING_CONSENT_TTL_MS + 1;
    const response = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent`,
      deps,
      jar,
    );
    const html = await response.text();
    expect(html).toContain("This request has expired");
    expect(html).toContain(
      "Connection requests only last a short time, so this one was stopped. Nothing was shared.",
    );
    expect(html).toContain("Go back to the app you were connecting and start again.");
    expect(html).toContain('id="expired-heading"');
    expect(html).toContain('tabindex="-1"');
  });

  it("disables Allow and Deny while a POST is in flight", async () => {
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
      `${MCP_OAUTH_TEST_BASE}/oauth/consent`,
      deps,
      jar,
    );
    const html = await response.text();
    expect(html).toContain("if (deny) deny.disabled = next");
    expect(html).toContain("if (allow) allow.disabled = next");
  });
});
