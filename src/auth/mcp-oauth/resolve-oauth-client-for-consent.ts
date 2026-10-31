import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { hostFromUrl, sanitizeOAuthClientDisplayName } from "./sanitize-client-name.js";

export type ResolvedOAuthClientForConsent = {
  clientId: string;
  redirectUri: string;
  displayName: string;
};

export async function resolveOAuthClientForConsent(
  sql: SqlStoragePort,
  clientId: string,
  redirectUri: string,
): Promise<ResolvedOAuthClientForConsent | null> {
  const row = await sql.first<{ redirectUris: string; name: string | null }>(
    'SELECT "redirectUris", name FROM "oauthClient" WHERE "clientId" = ? LIMIT 1',
    [clientId],
  );
  if (!row) {
    return null;
  }
  let redirectUris: unknown;
  try {
    redirectUris = JSON.parse(row.redirectUris) as unknown;
  } catch {
    return null;
  }
  if (
    !Array.isArray(redirectUris) ||
    !redirectUris.every((entry) => typeof entry === "string")
  ) {
    return null;
  }
  if (!redirectUris.includes(redirectUri)) {
    return null;
  }
  const fallbackHost = hostFromUrl(clientId);
  const displayName = sanitizeOAuthClientDisplayName(row.name, fallbackHost);
  return { clientId, redirectUri, displayName };
}
