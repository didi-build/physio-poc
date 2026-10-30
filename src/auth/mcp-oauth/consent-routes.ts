import { generateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import type { PractitionerSession } from "../auth-port.js";
import {
  PHYSIO_MCP_CONSENT_CSRF_COOKIE,
  generateOpaqueToken,
  sha256Hex,
} from "./consent-crypto.js";
import { withMcpOAuthConsentFrameHeaders } from "./consent-frame-headers.js";
import {
  PHYSIO_MCP_OAUTH_CONSENT_ALLOW_PATH,
  PHYSIO_MCP_OAUTH_CONSENT_DENY_PATH,
  PHYSIO_MCP_OAUTH_CONSENT_PATH,
} from "./paths.js";
import {
  PHYSIO_MCP_PENDING_CONSENT_TTL_MS,
  findPhysioMcpPendingConsentById,
  insertPhysioMcpPendingConsent,
  isPhysioMcpPendingConsentUsable,
  markPhysioMcpPendingConsentConsumed,
} from "./pending-consent.js";
import {
  deleteOAuthConsentRecordsForUserClient,
  insertPhysioMcpPractitionerConsent,
} from "./practitioner-consent.js";

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

function plainStatus(status: number, extraHeaders?: HeadersInit): Response {
  return new Response(null, withMcpOAuthConsentFrameHeaders({ status, headers: extraHeaders }));
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

async function handleConsentGet(input: HandlePhysioMcpConsentRoutesInput): Promise<Response> {
  const { request, authSecret, practitioner, sql, clock } = input;
  if (!practitioner) {
    return plainStatus(401);
  }
  const url = new URL(request.url);
  const oauthQuery = parseOAuthQueryString(url);
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
  const scopes = scope.split(/\s+/).filter(Boolean);
  const nowMs = (clock ?? systemPhysioMcpConsentClock).nowMs();
  const pendingId = generateOpaqueEntityId();
  const csrfToken = generateOpaqueToken(16);
  const csrfHash = await sha256Hex(csrfToken);
  await insertPhysioMcpPendingConsent(sql, {
    id: pendingId,
    practitioner_id: practitioner.practitionerId,
    client_id: clientId,
    redirect_uri: redirectUri,
    scopes_json: JSON.stringify(scopes),
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
  return plainStatus(403, headers);
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

async function loadPendingForRequest(
  input: HandlePhysioMcpConsentRoutesInput,
): Promise<
  | { ok: true; pendingId: string; csrfToken: string }
  | { ok: false; response: Response }
> {
  const { request, practitioner, sql, clock } = input;
  if (!practitioner) {
    return { ok: false, response: plainStatus(401) };
  }
  const pendingId = readCookie(request, PENDING_COOKIE);
  const csrfToken = readCookie(request, PHYSIO_MCP_CONSENT_CSRF_COOKIE);
  if (!pendingId || !csrfToken) {
    return { ok: false, response: plainStatus(403) };
  }
  const pending = await findPhysioMcpPendingConsentById(sql, pendingId);
  if (!pending) {
    return { ok: false, response: plainStatus(403) };
  }
  const nowMs = (clock ?? systemPhysioMcpConsentClock).nowMs();
  if (!isPhysioMcpPendingConsentUsable(pending, nowMs)) {
    return { ok: false, response: plainStatus(403) };
  }
  if (pending.practitioner_id !== practitioner.practitionerId) {
    return { ok: false, response: plainStatus(403) };
  }
  const csrfHash = await sha256Hex(csrfToken);
  if (csrfHash !== pending.csrf_token_hash) {
    return { ok: false, response: plainStatus(403) };
  }
  return { ok: true, pendingId, csrfToken };
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

async function handleConsentAllow(
  input: HandlePhysioMcpConsentRoutesInput,
): Promise<Response> {
  const loaded = await loadPendingForRequest(input);
  if (!loaded.ok) {
    return loaded.response;
  }
  const pending = await findPhysioMcpPendingConsentById(input.sql, loaded.pendingId);
  if (!pending) {
    return plainStatus(403);
  }
  const consumed = await markPhysioMcpPendingConsentConsumed(
    input.sql,
    pending.id,
    (input.clock ?? systemPhysioMcpConsentClock).nowMs(),
  );
  if (!consumed) {
    return plainStatus(403);
  }
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
    await deleteOAuthConsentRecordsForUserClient(
      input.sql,
      userId,
      pending.client_id,
    );
  }
  await insertPhysioMcpPractitionerConsent(input.sql, {
    id: generateOpaqueEntityId(),
    practitioner_id: pending.practitioner_id,
    client_id: pending.client_id,
    redirect_uri: pending.redirect_uri,
    scopes_json: pending.scopes_json,
    created_at: new Date().toISOString(),
  });
  return new Response(null, withMcpOAuthConsentFrameHeaders({
    status: 302,
    headers: { Location: payload.url },
  }));
}

async function handleConsentDeny(
  input: HandlePhysioMcpConsentRoutesInput,
): Promise<Response> {
  const loaded = await loadPendingForRequest(input);
  if (!loaded.ok) {
    return loaded.response;
  }
  const pending = await findPhysioMcpPendingConsentById(input.sql, loaded.pendingId);
  if (!pending) {
    return plainStatus(403);
  }
  await markPhysioMcpPendingConsentConsumed(
    input.sql,
    pending.id,
    (input.clock ?? systemPhysioMcpConsentClock).nowMs(),
  );
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
  return new Response(null, withMcpOAuthConsentFrameHeaders({
    status: 302,
    headers: { Location: payload.url },
  }));
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

export async function peekPendingConsentReachable(
  sql: SqlStoragePort,
  practitionerId: string,
  clientId: string,
  clock: PhysioMcpConsentClock = systemPhysioMcpConsentClock,
): Promise<boolean> {
  const rows = await sql.all<{ expires_at_ms: number; consumed_at_ms: number | null }>(
    "SELECT expires_at_ms, consumed_at_ms FROM physio_mcp_pending_consent WHERE practitioner_id = ? AND client_id = ?",
    [practitionerId, clientId],
  );
  const nowMs = clock.nowMs();
  return rows.some(
    (row) => row.consumed_at_ms === null && nowMs < row.expires_at_ms,
  );
}
