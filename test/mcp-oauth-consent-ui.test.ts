import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  CHATGPT_CIMD_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  CookieJar,
  MCP_OAUTH_SCOPES,
  MCP_OAUTH_TEST_BASE,
  allowConsent,
  buildAuthorizeUrl,
  completeGoogleSignIn,
  createChatGptCimdDocument,
  createMcpOAuthTestDeps,
  defaultCimdDocuments,
  followAuthorizeToConsent,
  mcpResourceUrl,
  postConsentAllow,
  postConsentDeny,
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

function consentHtmlDocument(html: string): Document {
  return new JSDOM(html).window.document;
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
    const doc = consentHtmlDocument(html);
    expect(
      doc.querySelector("a.consent-sign-out-link#consent-sign-out"),
    ).not.toBeNull();
    expect(doc.querySelector(".consent-list-icon-wrap-can")).not.toBeNull();
    expect(doc.querySelector(".consent-list-icon-wrap-cant")).not.toBeNull();
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

  it("sets Cache-Control no-store on consent HTML", async () => {
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
    expect(response.headers.get("Cache-Control")).toBe("no-store");
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

  it("requires consent again when client_id changes but redirect_uri and scopes match", async () => {
    const altClientId = "https://chatgpt.com/oauth/alt-client.json";
    const cimdDocuments = {
      [CHATGPT_CIMD_CLIENT_ID]: createChatGptCimdDocument(),
      [altClientId]: {
        ...createChatGptCimdDocument(),
        client_id: altClientId,
        client_name: "Alt ChatGPT",
      },
    };
    const deps = await createMcpOAuthTestDeps(cimdDocuments);
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
        clientId: altClientId,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    expect(consent.status).toBe(200);
    expect(await consent.text()).toContain("Allow read-only access to Didi Physio?");
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

  it("skips consent when the same scopes are listed in a different order", async () => {
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
    const scopeParts = MCP_OAUTH_SCOPES.split(/\s+/).filter(Boolean);
    const reversedScopes = [...scopeParts].reverse().join(" ");
    const url = buildAuthorizeUrl({
      clientId: CHATGPT_CIMD_CLIENT_ID,
      redirectUri: CHATGPT_REDIRECT_URI,
      verifier: randomPkceVerifier(),
      resource: mcpResourceUrl(),
    });
    url.searchParams.set("scope", reversedScopes);
    const second = await requestWithJar(url.toString(), deps, jar, {
      redirect: "manual",
    });
    expect(second.status).toBe(302);
    const consentFollow = await requestWithJar(
      new URL(second.headers.get("location")!, MCP_OAUTH_TEST_BASE).toString(),
      deps,
      jar,
      { redirect: "manual" },
    );
    expect(consentFollow.status).toBe(302);
    expect(consentFollow.headers.get("location")).toContain("code=");
    expect(consentFollow.headers.get("location")).not.toContain("/oauth/consent");
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
    expect(
      consentHtmlDocument(html).querySelector(
        ".consent-wordmark.consent-wordmark-centered",
      ),
    ).not.toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps the pending request after sign-out, shows consent for B, and completes allow as B", async () => {
    const deps = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
      allowedEmails: `${FAKE_GOOGLE_ALLOWED_EMAIL},${FAKE_GOOGLE_ALLOWED_B_EMAIL}`,
    });
    await seedTwoPractitioners(deps);
    const jarA = new CookieJar();
    await completeGoogleSignIn(deps, jarA, "allowed");
    const verifier = randomPkceVerifier();
    await followAuthorizeToConsent(
      deps,
      jarA,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier,
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
    const pendingRow = await deps.sql.first<{ id: string; practitioner_id: string }>(
      "SELECT id, practitioner_id FROM physio_mcp_pending_consent WHERE id = ?",
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
    const rebound = await deps.sql.first<{ practitioner_id: string }>(
      "SELECT practitioner_id FROM physio_mcp_pending_consent WHERE id = ?",
      [pendingBefore!],
    );
    expect(rebound?.practitioner_id).toBeTruthy();
    const redirect = await allowConsent(deps, jarA);
    expect(redirect.searchParams.get("code")).toBeTruthy();
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
    expect(html).toContain('document.getElementById("expired-heading").focus()');
    expect(
      consentHtmlDocument(html).querySelector(
        ".consent-wordmark.consent-wordmark-centered",
      ),
    ).not.toBeNull();
  });

  it("disables Allow and Deny while a consent POST is in flight", async () => {
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
    const dom = new JSDOM(html, {
      url: MCP_OAUTH_TEST_BASE,
      runScripts: "outside-only",
    });
    const { window } = dom;
    let resolveFetch!: (value: Response) => void;
    const fetchGate = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    window.fetch = vi.fn(() => fetchGate) as unknown as typeof window.fetch;
    for (const script of window.document.querySelectorAll("script")) {
      window.eval(script.textContent ?? "");
    }
    const allow = window.document.getElementById("consent-allow") as HTMLButtonElement;
    const deny = window.document.getElementById("consent-deny") as HTMLButtonElement;
    allow.click();
    expect(allow.disabled).toBe(true);
    expect(deny.disabled).toBe(true);
    resolveFetch(
      new Response(null, {
        status: 302,
        headers: { Location: `${CHATGPT_REDIRECT_URI}?code=test` },
      }),
    );
    await fetchGate;
  });

  it("shows After Deny copy and Cache-Control on deny", async () => {
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
    const denyResponse = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
      deps,
      jar,
      { method: "POST" },
    );
    expect(denyResponse.headers.get("Cache-Control")).toBe("no-store");
    const html = await denyResponse.text();
    expect(html).toContain("Not connected");
    expect(html).toContain("Nothing was shared. Taking you back to chatgpt.com.");
    const doc = consentHtmlDocument(html);
    const row = doc.querySelector(".consent-status-card .consent-status-row");
    expect(row).not.toBeNull();
    expect(row!.querySelector(".consent-spinner")).not.toBeNull();
    expect(row!.querySelector(".consent-heading")?.textContent).toBe("Not connected");
  });

  it("shows the expired page when deny is posted on an already consumed pending row", async () => {
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
    const denyAgain = await postConsentDeny(deps, jar);
    expect(denyAgain.status).toBe(200);
    const html = await denyAgain.text();
    expect(html).toContain("This request has expired");
  });

  it("refuses allow when pending redirect_uri no longer matches the registered client", async () => {
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
    const pendingId = jar.get("physio_mcp_pending_consent_id");
    expect(pendingId).toBeTruthy();
    await deps.sql.run(
      "UPDATE physio_mcp_pending_consent SET redirect_uri = ? WHERE id = ?",
      ["https://evil.example/callback", pendingId!],
    );
    const response = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
      deps,
      jar,
      { method: "POST" },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("This app can’t connect");
  });

  it("refuses deny when pending redirect_uri no longer matches the registered client", async () => {
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
    const pendingId = jar.get("physio_mcp_pending_consent_id");
    expect(pendingId).toBeTruthy();
    await deps.sql.run(
      "UPDATE physio_mcp_pending_consent SET redirect_uri = ? WHERE id = ?",
      ["https://evil.example/callback", pendingId!],
    );
    const response = await postConsentDeny(deps, jar);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("This app can’t connect");
  });

  it("returns 401 when allow is posted with no practitioner session", async () => {
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
    const signOut = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/api/auth/sign-out`,
      deps,
      jar,
      { method: "POST" },
    );
    expect(signOut.ok).toBe(true);
    const response = await postConsentAllow(deps, jar);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("returns 403 not expired HTML when a non-owner posts allow on an expired pending row", async () => {
    let nowMs = 3_000_000_000_000;
    const clock = { nowMs: () => nowMs };
    const deps = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
      allowedEmails: `${FAKE_GOOGLE_ALLOWED_EMAIL},${FAKE_GOOGLE_ALLOWED_B_EMAIL}`,
      consentClock: clock,
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
    nowMs += PHYSIO_MCP_PENDING_CONSENT_TTL_MS + 1;
    const jarB = new CookieJar();
    await completeGoogleSignIn(deps, jarB, "allowed-b");
    jarB.set("physio_mcp_pending_consent_id", stolenPending!);
    jarB.set("physio_mcp_consent_csrf", stolenCsrf!);
    const response = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
      deps,
      jarB,
      { method: "POST" },
    );
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).not.toContain("This request has expired");
  });

  it("renders After Allow in the status card layout", async () => {
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
    const allowResponse = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
      deps,
      jar,
      { method: "POST" },
    );
    const html = await allowResponse.text();
    expect(html).toContain("Connected");
    expect(html).toContain("Taking you back to chatgpt.com.");
    const row = consentHtmlDocument(html).querySelector(
      ".consent-status-card .consent-status-row",
    );
    expect(row).not.toBeNull();
    expect(row!.querySelector(".consent-spinner")).not.toBeNull();
    expect(row!.querySelector(".consent-heading")?.textContent).toBe("Connected");
  });
});
