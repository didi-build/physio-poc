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
import { PHYSIO_MCP_CONSENT_CSRF_HEADER } from "../src/auth/mcp-oauth/consent-crypto.js";
import { PHYSIO_MCP_PENDING_CONSENT_TTL_MS } from "../src/auth/mcp-oauth/pending-consent.js";
import { sanitizeOAuthClientDisplayName } from "../src/auth/mcp-oauth/sanitize-client-name.js";
import type { AppDependencies } from "../src/http/app.js";
import { wrapSqlStorageWithPendingSelectCounter } from "./helpers/counting-sql-storage.js";

const LONG_CLIENT_NAME_RAW =
  "ChatGPT Connector for Clinics and Practitioners Extended Edition 2026 Beta Build";
const LONG_CLIENT_NAME_DISPLAY = sanitizeOAuthClientDisplayName(
  LONG_CLIENT_NAME_RAW,
  "chatgpt.com",
);

async function seedTwoPractitioners(deps: AppDependencies) {
  await deps.sql.run(
    "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
    [generateOpaqueEntityId(), FAKE_GOOGLE_ALLOWED_B_EMAIL, "2026-01-01T00:00:00.000Z"],
  );
}

function normalizeCopyText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function expectExactPageCopy(
  doc: Document,
  rootSelector: string,
  strings: readonly string[],
): void {
  const root = doc.querySelector(rootSelector);
  expect(root).not.toBeNull();
  let remainder = normalizeCopyText(root!.textContent ?? "");
  for (const piece of strings) {
    const normalized = normalizeCopyText(piece);
    expect(
      remainder.startsWith(normalized),
      `expected copy to start with: ${piece}`,
    ).toBe(true);
    remainder = remainder.slice(normalized.length).trimStart();
  }
  expect(remainder).toBe("");
}

function consentHtmlDocument(html: string): Document {
  return new JSDOM(html, { url: MCP_OAUTH_TEST_BASE }).window.document;
}

async function createCountedMcpOAuthTestDeps(
  ...args: Parameters<typeof createMcpOAuthTestDeps>
): Promise<{
  deps: AppDependencies;
  pendingConsentStoreCallCount: () => number;
  pendingConsentWriteCallCount: () => number;
  sqlWriteCallCount: () => number;
  resetPendingConsentStoreCallCount: () => void;
}> {
  let counted!: ReturnType<typeof wrapSqlStorageWithPendingSelectCounter>;
  const deps = await createMcpOAuthTestDeps(args[0], {
    ...args[1],
    wrapSqlPort: (inner) => {
      counted = wrapSqlStorageWithPendingSelectCounter(inner);
      return counted.sql;
    },
  });
  return {
    deps,
    pendingConsentStoreCallCount: () => counted.pendingConsentStoreCallCount(),
    pendingConsentWriteCallCount: () => counted.pendingConsentWriteCallCount(),
    sqlWriteCallCount: () => counted.sqlWriteCallCount(),
    resetPendingConsentStoreCallCount: () =>
      counted.resetPendingConsentStoreCallCount(),
  };
}

function duplicateCookieJar(source: CookieJar): CookieJar {
  const target = new CookieJar();
  const raw = source.header();
  if (!raw) {
    return target;
  }
  for (const segment of raw.split(";")) {
    const eq = segment.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    target.set(segment.slice(0, eq).trim(), segment.slice(eq + 1).trim());
  }
  return target;
}

async function referencePlain403ConsentAllowFingerprint(
  deps: AppDependencies,
  jar: CookieJar,
): Promise<Awaited<ReturnType<typeof consentHttpFingerprint>>> {
  const probeJar = duplicateCookieJar(jar);
  probeJar.set("physio_mcp_pending_consent_id", generateOpaqueEntityId());
  const reference = await consentHttpFingerprint(
    await requestWithJar(`${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`, deps, probeJar, {
      method: "POST",
    }),
  );
  expect(reference.status).toBe(403);
  expect(reference.body).toBe("");
  return reference;
}

async function consentHttpFingerprint(response: Response): Promise<{
  status: number;
  headerLines: string[];
  body: string;
}> {
  const headerLines: string[] = [];
  response.headers.forEach((value, name) => {
    headerLines.push(`${name.toLowerCase()}: ${value}`);
  });
  if (typeof response.headers.getSetCookie === "function") {
    for (const cookie of response.headers.getSetCookie()) {
      headerLines.push(`set-cookie: ${cookie}`);
    }
  }
  headerLines.sort();
  return {
    status: response.status,
    headerLines,
    body: await response.text(),
  };
}

const CONSENT_PAGE_SPEC_STRINGS = [
  "Connect an app · Didi Physio",
  "Request from ",
  "chatgpt.com",
  "Allow read-only access to Didi Physio?",
  "The app calls itself",
  "ChatGPT",
  "Self-reported",
  "It can",
  "Search your approved exercises",
  "Search your routines",
  "See your programs and their share links",
  "It can’t",
  "Create, edit, publish or delete anything",
  "For changes, it sends you a link to the right page here instead",
  "Didi Physio never stores or shares patient details.",
  "Only allow it if you just started connecting from chatgpt.com.",
  "Deny",
  "Allow",
  `Signed in as ${FAKE_GOOGLE_ALLOWED_EMAIL}`,
  "Not you? Sign out",
] as const;

const CONSENT_CARD_SPEC_COPY = [
  "D",
  "Didi Physio",
  "Request from chatgpt.com",
  "Allow read-only access to Didi Physio?",
  `The app calls itself “ChatGPT” Self-reported`,
  "It can",
  "Search your approved exercises",
  "Search your routines",
  "See your programs and their share links",
  "It can’t",
  "Create, edit, publish or delete anything",
  "For changes, it sends you a link to the right page here instead",
  "Didi Physio never stores or shares patient details.",
  "Only allow it if you just started connecting from chatgpt.com.",
  "Deny",
  "Allow",
  `Signed in as ${FAKE_GOOGLE_ALLOWED_EMAIL}`,
  "Not you? Sign out",
] as const;

const INVALID_CLIENT_CARD_SPEC_COPY = [
  "D",
  "Didi Physio",
  "This app can’t connect",
  "The app asking to connect didn’t identify itself in a way Didi Physio accepts, so nothing was shared.",
  "Go back to the app and try connecting again. If it keeps happening, the app may not work with Didi Physio yet.",
  "Go to Didi Physio",
] as const;

const EXPIRED_CARD_SPEC_COPY = [
  "D",
  "Didi Physio",
  "This request has expired",
  "Connection requests only last a short time, so this one was stopped. Nothing was shared.",
  "Go back to the app you were connecting and start again.",
  "Go to Didi Physio",
] as const;

const AFTER_ALLOW_STATUS_SPEC_COPY = [
  "Connected",
  "Taking you back to chatgpt.com.",
] as const;

const AFTER_DENY_STATUS_SPEC_COPY = [
  "Not connected",
  "Nothing was shared. Taking you back to chatgpt.com.",
] as const;

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
    const doc = consentHtmlDocument(html);
    expect(doc.querySelector("title")?.textContent).toBe(CONSENT_PAGE_SPEC_STRINGS[0]);
    expectExactPageCopy(doc, ".consent-card", CONSENT_CARD_SPEC_COPY);
    expect(
      doc.querySelector("a.consent-sign-out-link#consent-sign-out"),
    ).not.toBeNull();
    expect(doc.querySelector(".consent-list-icon-wrap-can")).not.toBeNull();
    expect(doc.querySelector(".consent-list-icon-wrap-cant")).not.toBeNull();
    expect(doc.querySelector(".consent-host-emphasis")?.textContent).toBe(
      "chatgpt.com",
    );
    expect(doc.querySelector(".consent-name-inline")).not.toBeNull();
    const root = doc.querySelector(".consent-root") as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(doc.defaultView!.getComputedStyle(root!).alignItems).toBe("center");
  });

  it("includes the sanitized long client name in consent HTML", async () => {
    const doc = {
      ...createChatGptCimdDocument(),
      client_name: LONG_CLIENT_NAME_RAW,
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
    const doc1280 = consentHtmlDocument(html);
    expect(doc1280.querySelector(".consent-name-inline")?.textContent).toContain(
      LONG_CLIENT_NAME_DISPLAY,
    );
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
    const doc = consentHtmlDocument(html);
    expectExactPageCopy(
      doc,
      ".consent-card.consent-card-centered",
      INVALID_CLIENT_CARD_SPEC_COPY,
    );
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
    const practitionerB = await deps.sql.first<{ id: string }>(
      "SELECT id FROM practitioners WHERE email = ? LIMIT 1",
      [FAKE_GOOGLE_ALLOWED_B_EMAIL],
    );
    expect(practitionerB?.id).toBeTruthy();
    const resume = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent`,
      deps,
      jarA,
    );
    expect(resume.status).toBe(200);
    const resumeHtml = await resume.text();
    expect(resumeHtml).toContain("Allow read-only access to Didi Physio?");
    expect(resumeHtml).toContain(`Signed in as ${FAKE_GOOGLE_ALLOWED_B_EMAIL}`);
    expect(resumeHtml).not.toContain(`Signed in as ${FAKE_GOOGLE_ALLOWED_EMAIL}`);
    const rebound = await deps.sql.first<{ practitioner_id: string }>(
      "SELECT practitioner_id FROM physio_mcp_pending_consent WHERE id = ?",
      [pendingBefore!],
    );
    expect(rebound?.practitioner_id).toBe(practitionerB!.id);
    const redirect = await allowConsent(deps, jarA);
    expect(redirect.searchParams.get("code")).toBeTruthy();
  });

  it("rebinds pending consent to B on GET when the oauth query is still in the URL", async () => {
    const deps = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
      allowedEmails: `${FAKE_GOOGLE_ALLOWED_EMAIL},${FAKE_GOOGLE_ALLOWED_B_EMAIL}`,
    });
    await seedTwoPractitioners(deps);
    const jarA = new CookieJar();
    await completeGoogleSignIn(deps, jarA, "allowed");
    const authorizeUrl = buildAuthorizeUrl({
      clientId: CHATGPT_CIMD_CLIENT_ID,
      redirectUri: CHATGPT_REDIRECT_URI,
      verifier: randomPkceVerifier(),
      resource: mcpResourceUrl(),
    });
    const first = await requestWithJar(authorizeUrl.toString(), deps, jarA, {
      redirect: "manual",
    });
    const consentUrl = new URL(first.headers.get("location")!, MCP_OAUTH_TEST_BASE);
    await requestWithJar(consentUrl.toString(), deps, jarA);
    const pendingBefore = jarA.get("physio_mcp_pending_consent_id");
    expect(pendingBefore).toBeTruthy();
    await requestWithJar(`${MCP_OAUTH_TEST_BASE}/api/auth/sign-out`, deps, jarA, {
      method: "POST",
    });
    await completeGoogleSignIn(deps, jarA, "allowed-b");
    const practitionerB = await deps.sql.first<{ id: string }>(
      "SELECT id FROM practitioners WHERE email = ? LIMIT 1",
      [FAKE_GOOGLE_ALLOWED_B_EMAIL],
    );
    const resume = await requestWithJar(consentUrl.toString(), deps, jarA);
    expect(resume.status).toBe(200);
    expect(await resume.text()).toContain(
      `Signed in as ${FAKE_GOOGLE_ALLOWED_B_EMAIL}`,
    );
    const rebound = await deps.sql.first<{ practitioner_id: string }>(
      "SELECT practitioner_id FROM physio_mcp_pending_consent WHERE id = ?",
      [pendingBefore!],
    );
    expect(rebound?.practitioner_id).toBe(practitionerB!.id);
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
    const doc = consentHtmlDocument(html);
    expectExactPageCopy(
      doc,
      ".consent-card.consent-card-centered",
      EXPIRED_CARD_SPEC_COPY,
    );
    expect(html).toContain('id="expired-heading"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('document.getElementById("expired-heading").focus()');
    expect(
      consentHtmlDocument(html).querySelector(
        ".consent-wordmark.consent-wordmark-centered",
      ),
    ).not.toBeNull();
  });

  it("matches expired TTL GET responses when the pending row is missing", async () => {
    let nowMs = 4_000_000_000_000;
    const clock = { nowMs: () => nowMs };
    const deps = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
      consentClock: clock,
    });
    const jarExpired = new CookieJar();
    await completeGoogleSignIn(deps, jarExpired);
    await followAuthorizeToConsent(
      deps,
      jarExpired,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    nowMs += PHYSIO_MCP_PENDING_CONSENT_TTL_MS + 1;
    const ttlExpiredGet = await consentHttpFingerprint(
      await requestWithJar(`${MCP_OAUTH_TEST_BASE}/oauth/consent`, deps, jarExpired),
    );

    const jarMissing = new CookieJar();
    await completeGoogleSignIn(deps, jarMissing);
    await followAuthorizeToConsent(
      deps,
      jarMissing,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    const pendingId = jarMissing.get("physio_mcp_pending_consent_id");
    expect(pendingId).toBeTruthy();
    await deps.sql.run("DELETE FROM physio_mcp_pending_consent WHERE id = ?", [
      pendingId!,
    ]);
    const missingRowGet = await consentHttpFingerprint(
      await requestWithJar(`${MCP_OAUTH_TEST_BASE}/oauth/consent`, deps, jarMissing),
    );

    expect(missingRowGet).toEqual(ttlExpiredGet);
    expect(missingRowGet.body).not.toContain("This app can’t connect");
    expect(
      missingRowGet.headerLines.some((line) => line.startsWith("x-frame-options:")),
    ).toBe(true);
    expect(
      missingRowGet.headerLines.some((line) =>
        line.startsWith("content-security-policy:"),
      ),
    ).toBe(true);
  });

  it("returns identical plain 403 for POST with a made-up pending id and another practitioner's live id", async () => {
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
    const livePending = jarA.get("physio_mcp_pending_consent_id");
    const stolenCsrf = jarA.get("physio_mcp_consent_csrf");

    const jarB = new CookieJar();
    await completeGoogleSignIn(deps, jarB, "allowed-b");
    jarB.set("physio_mcp_pending_consent_id", livePending!);
    jarB.set("physio_mcp_consent_csrf", stolenCsrf!);
    const liveIdResponse = await consentHttpFingerprint(
      await requestWithJar(`${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`, deps, jarB, {
        method: "POST",
      }),
    );

    jarB.set("physio_mcp_pending_consent_id", generateOpaqueEntityId());
    const fakeIdResponse = await consentHttpFingerprint(
      await requestWithJar(`${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`, deps, jarB, {
        method: "POST",
      }),
    );

    expect(fakeIdResponse).toEqual(liveIdResponse);
    expect(liveIdResponse.status).toBe(403);
    expect(liveIdResponse.body).toBe("");
  });

  it("returns identical plain 403 when the owner row is missing and when another practitioner owns the row", async () => {
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
    const pendingId = jarA.get("physio_mcp_pending_consent_id");
    const csrf = jarA.get("physio_mcp_consent_csrf");

    const jarB = new CookieJar();
    await completeGoogleSignIn(deps, jarB, "allowed-b");
    jarB.set("physio_mcp_pending_consent_id", pendingId!);
    jarB.set("physio_mcp_consent_csrf", csrf!);
    const foreignOwner = await consentHttpFingerprint(
      await requestWithJar(`${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`, deps, jarB, {
        method: "POST",
      }),
    );

    await deps.sql.run("DELETE FROM physio_mcp_pending_consent WHERE id = ?", [
      pendingId!,
    ]);
    const missingOwner = await consentHttpFingerprint(
      await postConsentDeny(deps, jarA),
    );

    expect(foreignOwner).toEqual(missingOwner);
    expect(missingOwner.status).toBe(403);
    expect(missingOwner.body).toBe("");
  });

  it("returns byte-identical plain 403 for bad CSRF or Origin on owner expired and consumed rows", async () => {
    let nowMs = 5_000_000_000_000;
    const clock = { nowMs: () => nowMs };
    const depsExpired = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
      consentClock: clock,
    });
    const jarExpired = new CookieJar();
    await completeGoogleSignIn(depsExpired, jarExpired);
    await followAuthorizeToConsent(
      depsExpired,
      jarExpired,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    const expiredReference = await referencePlain403ConsentAllowFingerprint(
      depsExpired,
      jarExpired,
    );
    nowMs += PHYSIO_MCP_PENDING_CONSENT_TTL_MS + 1;
    const expiredBadCsrf = await consentHttpFingerprint(
      await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        depsExpired,
        jarExpired,
        {
          method: "POST",
          headers: { [PHYSIO_MCP_CONSENT_CSRF_HEADER]: "wrong-token" },
        },
      ),
    );
    expect(expiredBadCsrf).toEqual(expiredReference);
    expect(expiredBadCsrf.body).not.toContain("This request has expired");

    const jarExpiredOrigin = duplicateCookieJar(jarExpired);
    const expiredBadOrigin = await consentHttpFingerprint(
      await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        depsExpired,
        jarExpiredOrigin,
        {
          method: "POST",
          headers: { origin: "https://evil.example" },
        },
      ),
    );
    expect(expiredBadOrigin).toEqual(expiredReference);
    expect(expiredBadOrigin.body).not.toContain("This request has expired");

    nowMs = 6_000_000_000_000;
    const depsConsumed = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
      consentClock: clock,
    });
    const jarConsumed = new CookieJar();
    await completeGoogleSignIn(depsConsumed, jarConsumed);
    await followAuthorizeToConsent(
      depsConsumed,
      jarConsumed,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    await allowConsent(depsConsumed, jarConsumed);
    const consumedReference = await referencePlain403ConsentAllowFingerprint(
      depsConsumed,
      jarConsumed,
    );
    const consumedBadCsrf = await consentHttpFingerprint(
      await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
        depsConsumed,
        jarConsumed,
        {
          method: "POST",
          headers: { [PHYSIO_MCP_CONSENT_CSRF_HEADER]: "wrong-token" },
        },
      ),
    );
    expect(consumedBadCsrf).toEqual(consumedReference);
    expect(consumedBadCsrf.body).not.toContain("This request has expired");

    const jarConsumedOrigin = duplicateCookieJar(jarConsumed);
    const consumedBadOrigin = await consentHttpFingerprint(
      await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
        depsConsumed,
        jarConsumedOrigin,
        {
          method: "POST",
          headers: { origin: "https://evil.example" },
        },
      ),
    );
    expect(consumedBadOrigin).toEqual(consumedReference);
    expect(consumedBadOrigin.body).not.toContain("This request has expired");
  });

  it("returns byte-identical plain 403 for bad CSRF on a missing row as on an expired row", async () => {
    let nowMs = 5_100_000_000_000;
    const clock = { nowMs: () => nowMs };
    const deps = await createMcpOAuthTestDeps(defaultCimdDocuments(), {
      consentClock: clock,
    });
    const jarExpired = new CookieJar();
    await completeGoogleSignIn(deps, jarExpired);
    await followAuthorizeToConsent(
      deps,
      jarExpired,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    nowMs += PHYSIO_MCP_PENDING_CONSENT_TTL_MS + 1;
    const expiredBadCsrf = await consentHttpFingerprint(
      await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
        deps,
        jarExpired,
        {
          method: "POST",
          headers: { [PHYSIO_MCP_CONSENT_CSRF_HEADER]: "wrong-token" },
        },
      ),
    );

    const jarMissing = new CookieJar();
    await completeGoogleSignIn(deps, jarMissing);
    await followAuthorizeToConsent(
      deps,
      jarMissing,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    const pendingId = jarMissing.get("physio_mcp_pending_consent_id");
    expect(pendingId).toBeTruthy();
    await deps.sql.run("DELETE FROM physio_mcp_pending_consent WHERE id = ?", [
      pendingId!,
    ]);
    const missingBadCsrf = await consentHttpFingerprint(
      await requestWithJar(
        `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
        deps,
        jarMissing,
        {
          method: "POST",
          headers: { [PHYSIO_MCP_CONSENT_CSRF_HEADER]: "wrong-token" },
        },
      ),
    );

    expect(missingBadCsrf).toEqual(expiredBadCsrf);
    expect(missingBadCsrf.status).toBe(403);
    expect(missingBadCsrf.body).toBe("");
  });

  it("makes zero pending-row store calls on bad CSRF or Origin POST (missing, live, expired) and counts store calls on valid allow", async () => {
    let nowMs = 5_200_000_000_000;
    const clock = { nowMs: () => nowMs };
    const {
      deps,
      pendingConsentStoreCallCount,
      sqlWriteCallCount,
      resetPendingConsentStoreCallCount,
    } = await createCountedMcpOAuthTestDeps(defaultCimdDocuments(), {
      consentClock: clock,
    });

    const jarLive = new CookieJar();
    await completeGoogleSignIn(deps, jarLive);
    await followAuthorizeToConsent(
      deps,
      jarLive,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );

    resetPendingConsentStoreCallCount();
    const liveBadCsrf = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
      deps,
      jarLive,
      {
        method: "POST",
        headers: { [PHYSIO_MCP_CONSENT_CSRF_HEADER]: "wrong-token" },
      },
    );
    expect(liveBadCsrf.status).toBe(403);
    expect(pendingConsentStoreCallCount()).toBe(0);

    resetPendingConsentStoreCallCount();
    const liveBadOrigin = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
      deps,
      jarLive,
      {
        method: "POST",
        headers: { origin: "https://evil.example" },
      },
    );
    expect(liveBadOrigin.status).toBe(403);
    expect(pendingConsentStoreCallCount()).toBe(0);

    nowMs += PHYSIO_MCP_PENDING_CONSENT_TTL_MS + 1;
    resetPendingConsentStoreCallCount();
    const expiredBadCsrf = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
      deps,
      jarLive,
      {
        method: "POST",
        headers: { [PHYSIO_MCP_CONSENT_CSRF_HEADER]: "wrong-token" },
      },
    );
    expect(expiredBadCsrf.status).toBe(403);
    expect(pendingConsentStoreCallCount()).toBe(0);

    resetPendingConsentStoreCallCount();
    const expiredBadOrigin = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
      deps,
      jarLive,
      {
        method: "POST",
        headers: { origin: "https://evil.example" },
      },
    );
    expect(expiredBadOrigin.status).toBe(403);
    expect(pendingConsentStoreCallCount()).toBe(0);

    const jarMissing = new CookieJar();
    await completeGoogleSignIn(deps, jarMissing);
    await followAuthorizeToConsent(
      deps,
      jarMissing,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    const pendingId = jarMissing.get("physio_mcp_pending_consent_id");
    await deps.sql.run("DELETE FROM physio_mcp_pending_consent WHERE id = ?", [
      pendingId!,
    ]);
    resetPendingConsentStoreCallCount();
    const missingBadCsrf = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
      deps,
      jarMissing,
      {
        method: "POST",
        headers: { [PHYSIO_MCP_CONSENT_CSRF_HEADER]: "wrong-token" },
      },
    );
    expect(missingBadCsrf.status).toBe(403);
    expect(pendingConsentStoreCallCount()).toBe(0);

    resetPendingConsentStoreCallCount();
    const missingBadOrigin = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/deny`,
      deps,
      jarMissing,
      {
        method: "POST",
        headers: { origin: "https://evil.example" },
      },
    );
    expect(missingBadOrigin.status).toBe(403);
    expect(pendingConsentStoreCallCount()).toBe(0);

    const jarAllowControl = new CookieJar();
    await completeGoogleSignIn(deps, jarAllowControl);
    await followAuthorizeToConsent(
      deps,
      jarAllowControl,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    resetPendingConsentStoreCallCount();
    await postConsentAllow(deps, jarAllowControl);
    expect(pendingConsentStoreCallCount()).toBeGreaterThanOrEqual(1);
    expect(sqlWriteCallCount()).toBeGreaterThanOrEqual(1);
  });

  it("returns plain 403 with zero pending-row writes when CSRF header matches cookie but not the stored hash (expired and consumed rows)", async () => {
    let nowMs = 8_000_000_000_000;
    const clock = { nowMs: () => nowMs };
    const {
      deps,
      pendingConsentWriteCallCount,
      sqlWriteCallCount,
      resetPendingConsentStoreCallCount,
    } = await createCountedMcpOAuthTestDeps(defaultCimdDocuments(), {
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
    const pendingId = jar.get("physio_mcp_pending_consent_id");
    expect(pendingId).toBeTruthy();
    await deps.sql.run(
      "UPDATE physio_mcp_pending_consent SET csrf_token_hash = ? WHERE id = ?",
      ["0".repeat(64), pendingId!],
    );

    nowMs += PHYSIO_MCP_PENDING_CONSENT_TTL_MS + 1;
    resetPendingConsentStoreCallCount();
    const expiredForged = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
      deps,
      jar,
      { method: "POST" },
    );
    expect(expiredForged.status).toBe(403);
    expect(await expiredForged.text()).toBe("");
    expect(pendingConsentWriteCallCount()).toBe(0);
    expect(sqlWriteCallCount()).toBe(0);

    nowMs = 9_000_000_000_000;
    const jarFresh = new CookieJar();
    await completeGoogleSignIn(deps, jarFresh);
    await followAuthorizeToConsent(
      deps,
      jarFresh,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    const consumedPendingId = jarFresh.get("physio_mcp_pending_consent_id");
    expect(consumedPendingId).toBeTruthy();
    await allowConsent(deps, jarFresh);
    await deps.sql.run(
      "UPDATE physio_mcp_pending_consent SET csrf_token_hash = ? WHERE id = ?",
      ["1".repeat(64), consumedPendingId!],
    );
    resetPendingConsentStoreCallCount();
    const consumedForged = await postConsentDeny(deps, jarFresh);
    expect(consumedForged.status).toBe(403);
    expect(await consumedForged.text()).toBe("");
    expect(pendingConsentWriteCallCount()).toBe(0);
    expect(sqlWriteCallCount()).toBe(0);
  });

  it("increments the wrapped SQL write counter on a valid allow POST (positive control)", async () => {
    const { deps, sqlWriteCallCount, resetPendingConsentStoreCallCount } =
      await createCountedMcpOAuthTestDeps(defaultCimdDocuments());
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
    resetPendingConsentStoreCallCount();
    await postConsentAllow(deps, jar);
    expect(sqlWriteCallCount()).toBeGreaterThanOrEqual(1);
  });

  it("shows the expired page when the owner posts allow on expired or consumed pending rows", async () => {
    let nowMs = 6_000_000_000_000;
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
    const expiredAllow = await requestWithJar(
      `${MCP_OAUTH_TEST_BASE}/oauth/consent/allow`,
      deps,
      jar,
      { method: "POST" },
    );
    expect(expiredAllow.status).toBe(200);
    expect(await expiredAllow.text()).toContain("This request has expired");

    nowMs = 7_000_000_000_000;
    const jarFresh = new CookieJar();
    await completeGoogleSignIn(deps, jarFresh);
    await followAuthorizeToConsent(
      deps,
      jarFresh,
      buildAuthorizeUrl({
        clientId: CHATGPT_CIMD_CLIENT_ID,
        redirectUri: CHATGPT_REDIRECT_URI,
        verifier: randomPkceVerifier(),
        resource: mcpResourceUrl(),
      }),
    );
    await allowConsent(deps, jarFresh);
    const consumedDeny = await postConsentDeny(deps, jarFresh);
    expect(consumedDeny.status).toBe(200);
    expect(await consumedDeny.text()).toContain("This request has expired");
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
    const doc = consentHtmlDocument(html);
    expectExactPageCopy(doc, ".consent-status-card", AFTER_DENY_STATUS_SPEC_COPY);
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
    const doc = consentHtmlDocument(html);
    expectExactPageCopy(doc, ".consent-status-card", AFTER_ALLOW_STATUS_SPEC_COPY);
    const row = doc.querySelector(".consent-status-card .consent-status-row");
    expect(row).not.toBeNull();
    expect(row!.querySelector(".consent-spinner")).not.toBeNull();
    expect(row!.querySelector(".consent-heading")?.textContent).toBe("Connected");
  });
});
