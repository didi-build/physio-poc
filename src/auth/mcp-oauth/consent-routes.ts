import { generateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import type { PractitionerSession } from "../auth-port.js";
import { signInPathWithReturnTo } from "../return-to.js";
import { displayRedirectHostFromUri } from "./consent-display-host.js";
import {
  PHYSIO_MCP_CONSENT_CSRF_COOKIE,
  PHYSIO_MCP_CONSENT_CSRF_HEADER,
  generateOpaqueToken,
  sha256Hex,
} from "./consent-crypto.js";
import { withMcpOAuthConsentFrameHeaders } from "./consent-frame-headers.js";
import {
  renderAfterAllowPageHtml,
  renderAfterDenyPageHtml,
  renderConsentPageHtml,
  renderExpiredRequestPageHtml,
  renderInvalidClientPageHtml,
} from "./consent-html.js";
import { scopesJsonFromOAuthScopeParam } from "./normalize-consent-scopes.js";
import {
  PHYSIO_MCP_OAUTH_CONSENT_ALLOW_PATH,
  PHYSIO_MCP_OAUTH_CONSENT_DENY_PATH,
  PHYSIO_MCP_OAUTH_CONSENT_PATH,
} from "./paths.js";
import {
  PHYSIO_MCP_PENDING_CONSENT_TTL_MS,
  findPhysioMcpPendingConsentById,
  findPhysioMcpPendingConsentForPractitioner,
  insertPhysioMcpPendingConsent,
  isPhysioMcpPendingConsentUsable,
  markPhysioMcpPendingConsentConsumed,
  type PhysioMcpPendingConsentRow,
} from "./pending-consent.js";
import {
  deleteOAuthConsentRecordsForUserClient,
  hasPhysioMcpRememberedConsent,
  insertPhysioMcpPractitionerConsent,
} from "./practitioner-consent.js";
import { resolveOAuthClientForConsent } from "./resolve-oauth-client-for-consent.js";

export type PhysioMcpConsentClock = {
  nowMs(): number;
};

export const systemPhysioMcpConsentClock: PhysioMcpConsentClock = {
  nowMs: () => Date.now(),
};

export type McpConsentAuthHandler = {
  handler(request: Request): Promise<Response>;
};

export type VerifyOAuthQueryParams = (
  oauthQuery: string,
  authSecret: string,
) => Promise<boolean>;

export type HandlePhysioMcpConsentRoutesInput = {
  request: Request;
  pathname: string;
  auth: McpConsentAuthHandler;
  sql: SqlStoragePort;
  authBaseUrl: string;
  authSecret: string;
  practitioner: PractitionerSession | null;
  clock?: PhysioMcpConsentClock;
  verifyOAuthQueryParams: VerifyOAuthQueryParams;
};

const PENDING_COOKIE = "physio_mcp_pending_consent_id";

function appHomeHref(authBaseUrl: string): string {
  return `${authBaseUrl.replace(/\/$/, "")}/`;
}

function plainStatus(status: number, extraHeaders?: HeadersInit): Response {
  return new Response(
    null,
    withMcpOAuthConsentFrameHeaders({ status, headers: extraHeaders }),
  );
}

function framedHtml(html: string, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(html, withMcpOAuthConsentFrameHeaders({ status, headers }));
}

function parseOAuthQueryString(url: URL): string | null {
  if (url.searchParams.toString().length === 0) {
    return null;
  }
  return url.searchParams.toString();
}

async function resolveAuthUserId(
  sql: SqlStoragePort,
  practitionerId: string,
): Promise<string | null> {
  const row = await sql.first<{ id: string }>(
    'SELECT id FROM "user" WHERE practitionerId = ? LIMIT 1',
    [practitionerId],
  );
  return row?.id ?? null;
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) {
    return null;
  }
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    if (trimmed.slice(0, eq) === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}

function consentSignInReturnUrl(): string {
  return signInPathWithReturnTo(PHYSIO_MCP_OAUTH_CONSENT_PATH);
}

async function expiredResponse(authBaseUrl: string): Promise<Response> {
  return framedHtml(renderExpiredRequestPageHtml(appHomeHref(authBaseUrl)));
}

async function invalidClientResponse(authBaseUrl: string): Promise<Response> {
  return framedHtml(renderInvalidClientPageHtml(appHomeHref(authBaseUrl)));
}

async function postOAuthConsent(
  input: HandlePhysioMcpConsentRoutesInput,
  accept: boolean,
  oauthQuery: string,
): Promise<Response> {
  const { auth, authBaseUrl, request } = input;
  const origin = new URL(authBaseUrl).origin;
  return auth.handler(
    new Request(`${authBaseUrl.replace(/\/$/, "")}/api/auth/oauth2/consent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
        origin,
      },
      body: JSON.stringify({ accept, oauth_query: oauthQuery }),
    }),
  );
}

async function completeAcceptedConsent(
  input: HandlePhysioMcpConsentRoutesInput,
  pending: {
    practitioner_id: string;
    client_id: string;
    redirect_uri: string;
    scopes_json: string;
    oauth_query: string;
  },
  options: { skipAfterPage: boolean; recordAudit: boolean },
): Promise<Response> {
  const consentResponse = await postOAuthConsent(input, true, pending.oauth_query);
  if (!consentResponse.ok) {
    return plainStatus(consentResponse.status);
  }
  let payload: { redirect?: boolean; url?: string };
  try {
    payload = (await consentResponse.json()) as { redirect?: boolean; url?: string };
  } catch {
    return plainStatus(500);
  }
  if (payload.redirect !== true || typeof payload.url !== "string") {
    return plainStatus(500);
  }
  const userId = await resolveAuthUserId(input.sql, pending.practitioner_id);
  if (userId) {
    await deleteOAuthConsentRecordsForUserClient(input.sql, userId, pending.client_id);
  }
  if (options.recordAudit) {
    await insertPhysioMcpPractitionerConsent(input.sql, {
      id: generateOpaqueEntityId(),
      practitioner_id: pending.practitioner_id,
      client_id: pending.client_id,
      redirect_uri: pending.redirect_uri,
      scopes_json: pending.scopes_json,
      created_at: new Date().toISOString(),
    });
  }
  const host = displayRedirectHostFromUri(pending.redirect_uri);
  if (options.skipAfterPage) {
    return new Response(
      null,
      withMcpOAuthConsentFrameHeaders({
        status: 302,
        headers: { Location: payload.url },
      }),
    );
  }
  return framedHtml(renderAfterAllowPageHtml(host, payload.url));
}

async function tryRememberedConsentAutoAllow(
  input: HandlePhysioMcpConsentRoutesInput,
  oauthQuery: string,
  clientId: string,
  redirectUri: string,
  scopesJson: string,
): Promise<Response | null> {
  const { practitioner, sql } = input;
  if (!practitioner) {
    return null;
  }
  const remembered = await hasPhysioMcpRememberedConsent(sql, {
    practitionerId: practitioner.practitionerId,
    clientId,
    redirectUri,
    scopesJson,
  });
  if (!remembered) {
    return null;
  }
  return completeAcceptedConsent(
    input,
    {
      practitioner_id: practitioner.practitionerId,
      client_id: clientId,
      redirect_uri: redirectUri,
      scopes_json: scopesJson,
      oauth_query: oauthQuery,
    },
    { skipAfterPage: true, recordAudit: false },
  );
}

async function handleConsentGet(
  input: HandlePhysioMcpConsentRoutesInput,
): Promise<Response> {
  const { request, authSecret, practitioner, sql, clock, authBaseUrl } = input;
  const url = new URL(request.url);

  if (!practitioner) {
    return plainStatus(401);
  }

  let oauthQuery = parseOAuthQueryString(url);
  const pendingIdFromCookie = readCookie(request, PENDING_COOKIE);

  if (!oauthQuery && pendingIdFromCookie) {
    const existing = await findPhysioMcpPendingConsentById(sql, pendingIdFromCookie);
    const nowMs = (clock ?? systemPhysioMcpConsentClock).nowMs();
    if (!existing) {
      return expiredResponse(authBaseUrl);
    }
    if (!isPhysioMcpPendingConsentUsable(existing, nowMs)) {
      return expiredResponse(authBaseUrl);
    }
    oauthQuery = existing.oauth_query;
  }

  if (!oauthQuery) {
    return plainStatus(400);
  }

  const signatureValid = await input.verifyOAuthQueryParams(oauthQuery, authSecret);
  if (!signatureValid) {
    return plainStatus(403);
  }

  const params = new URLSearchParams(oauthQuery);
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const scope = params.get("scope") ?? "";
  if (!clientId || !redirectUri) {
    return plainStatus(400);
  }

  const resolved = await resolveOAuthClientForConsent(sql, clientId, redirectUri);
  if (!resolved) {
    return invalidClientResponse(authBaseUrl);
  }

  const scopesJson = scopesJsonFromOAuthScopeParam(scope);
  const signInReturn = consentSignInReturnUrl();

  const rememberedRedirect = await tryRememberedConsentAutoAllow(
    input,
    oauthQuery,
    clientId,
    redirectUri,
    scopesJson,
  );
  if (rememberedRedirect) {
    return rememberedRedirect;
  }

  const nowMs = (clock ?? systemPhysioMcpConsentClock).nowMs();
  if (pendingIdFromCookie) {
    let existing = await findPhysioMcpPendingConsentById(sql, pendingIdFromCookie);
    if (existing && existing.oauth_query === oauthQuery) {
      if (!isPhysioMcpPendingConsentUsable(existing, nowMs)) {
        return expiredResponse(authBaseUrl);
      }
      if (existing.practitioner_id !== practitioner.practitionerId) {
        await sql.run(
          "UPDATE physio_mcp_pending_consent SET practitioner_id = ? WHERE id = ?",
          [practitioner.practitionerId, existing.id],
        );
        existing = {
          ...existing,
          practitioner_id: practitioner.practitionerId,
        };
      }
      const csrfToken = readCookie(request, PHYSIO_MCP_CONSENT_CSRF_COOKIE);
      if (!csrfToken) {
        return plainStatus(403);
      }
      const host = displayRedirectHostFromUri(redirectUri);
      return framedHtml(
        renderConsentPageHtml({
          host,
          clientName: resolved.displayName,
          email: practitioner.email,
          consentPageUrl: url.pathname + url.search,
          signInReturnUrl: signInReturn,
          csrfToken,
        }),
      );
    }
  }

  const pendingId = generateOpaqueEntityId();
  const csrfToken = generateOpaqueToken(16);
  const csrfHash = await sha256Hex(csrfToken);
  await insertPhysioMcpPendingConsent(sql, {
    id: pendingId,
    practitioner_id: practitioner.practitionerId,
    client_id: clientId,
    redirect_uri: redirectUri,
    scopes_json: scopesJson,
    oauth_query: oauthQuery,
    csrf_token_hash: csrfHash,
    created_at_ms: nowMs,
    expires_at_ms: nowMs + PHYSIO_MCP_PENDING_CONSENT_TTL_MS,
  });
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `${PENDING_COOKIE}=${pendingId}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
  headers.append(
    "Set-Cookie",
    `${PHYSIO_MCP_CONSENT_CSRF_COOKIE}=${csrfToken}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );

  const host = displayRedirectHostFromUri(redirectUri);
  return framedHtml(
    renderConsentPageHtml({
      host,
      clientName: resolved.displayName,
      email: practitioner.email,
      consentPageUrl: url.pathname + url.search,
      signInReturnUrl: signInReturn,
      csrfToken,
    }),
    200,
    headers,
  );
}

async function loadPendingForConsentPost(
  input: HandlePhysioMcpConsentRoutesInput,
): Promise<
  { ok: true; pending: PhysioMcpPendingConsentRow } | { ok: false; response: Response }
> {
  const { request, practitioner, sql, clock, authBaseUrl } = input;
  if (!practitioner) {
    return { ok: false, response: plainStatus(401) };
  }
  const pendingId = readCookie(request, PENDING_COOKIE);
  const csrfToken = readCookie(request, PHYSIO_MCP_CONSENT_CSRF_COOKIE);
  if (!pendingId || !csrfToken) {
    return { ok: false, response: plainStatus(403) };
  }
  const csrfHeader = request.headers.get(PHYSIO_MCP_CONSENT_CSRF_HEADER);
  if (!csrfHeader || csrfHeader !== csrfToken) {
    return { ok: false, response: plainStatus(403) };
  }
  const pending = await findPhysioMcpPendingConsentForPractitioner(
    sql,
    pendingId,
    practitioner.practitionerId,
  );
  if (!pending) {
    return { ok: false, response: plainStatus(403) };
  }
  const csrfHash = await sha256Hex(csrfToken);
  if (csrfHash !== pending.csrf_token_hash) {
    return { ok: false, response: plainStatus(403) };
  }
  const nowMs = (clock ?? systemPhysioMcpConsentClock).nowMs();
  if (!isPhysioMcpPendingConsentUsable(pending, nowMs)) {
    return { ok: false, response: await expiredResponse(authBaseUrl) };
  }
  return { ok: true, pending };
}

async function pendingRedirectUriStillRegistered(
  sql: SqlStoragePort,
  pending: { client_id: string; redirect_uri: string },
  authBaseUrl: string,
): Promise<Response | null> {
  const resolved = await resolveOAuthClientForConsent(
    sql,
    pending.client_id,
    pending.redirect_uri,
  );
  if (!resolved) {
    return invalidClientResponse(authBaseUrl);
  }
  return null;
}

function refuseCrossOriginConsentPost(
  request: Request,
  authBaseUrl: string,
): Response | null {
  const origin = request.headers.get("origin");
  if (origin === null) {
    return plainStatus(403);
  }
  const expected = new URL(authBaseUrl).origin;
  if (origin !== expected) {
    return plainStatus(403);
  }
  return null;
}

async function handleConsentAllow(
  input: HandlePhysioMcpConsentRoutesInput,
): Promise<Response> {
  const crossOrigin = refuseCrossOriginConsentPost(input.request, input.authBaseUrl);
  if (crossOrigin) {
    return crossOrigin;
  }
  const loaded = await loadPendingForConsentPost(input);
  if (!loaded.ok) {
    return loaded.response;
  }
  const pending = loaded.pending;
  const redirectGuard = await pendingRedirectUriStillRegistered(
    input.sql,
    pending,
    input.authBaseUrl,
  );
  if (redirectGuard) {
    return redirectGuard;
  }
  const consumed = await markPhysioMcpPendingConsentConsumed(
    input.sql,
    pending.id,
    (input.clock ?? systemPhysioMcpConsentClock).nowMs(),
  );
  if (!consumed) {
    return expiredResponse(input.authBaseUrl);
  }
  return completeAcceptedConsent(input, pending, {
    skipAfterPage: false,
    recordAudit: true,
  });
}

async function handleConsentDeny(
  input: HandlePhysioMcpConsentRoutesInput,
): Promise<Response> {
  const crossOrigin = refuseCrossOriginConsentPost(input.request, input.authBaseUrl);
  if (crossOrigin) {
    return crossOrigin;
  }
  const loaded = await loadPendingForConsentPost(input);
  if (!loaded.ok) {
    return loaded.response;
  }
  const pending = loaded.pending;
  const redirectGuard = await pendingRedirectUriStillRegistered(
    input.sql,
    pending,
    input.authBaseUrl,
  );
  if (redirectGuard) {
    return redirectGuard;
  }
  const consumed = await markPhysioMcpPendingConsentConsumed(
    input.sql,
    pending.id,
    (input.clock ?? systemPhysioMcpConsentClock).nowMs(),
  );
  if (!consumed) {
    return expiredResponse(input.authBaseUrl);
  }
  const consentResponse = await postOAuthConsent(input, false, pending.oauth_query);
  if (!consentResponse.ok) {
    return plainStatus(consentResponse.status);
  }
  let payload: { redirect?: boolean; url?: string };
  try {
    payload = (await consentResponse.json()) as { redirect?: boolean; url?: string };
  } catch {
    return plainStatus(500);
  }
  if (payload.redirect !== true || typeof payload.url !== "string") {
    return plainStatus(500);
  }
  const host = displayRedirectHostFromUri(pending.redirect_uri);
  return framedHtml(renderAfterDenyPageHtml(host, payload.url));
}

export async function handlePhysioMcpConsentRoutes(
  input: HandlePhysioMcpConsentRoutesInput,
): Promise<Response | null> {
  const { pathname, request } = input;
  if (pathname === PHYSIO_MCP_OAUTH_CONSENT_PATH && request.method === "GET") {
    return handleConsentGet(input);
  }
  if (pathname === PHYSIO_MCP_OAUTH_CONSENT_ALLOW_PATH && request.method === "POST") {
    return handleConsentAllow(input);
  }
  if (pathname === PHYSIO_MCP_OAUTH_CONSENT_DENY_PATH && request.method === "POST") {
    return handleConsentDeny(input);
  }
  return null;
}
