import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";

export type PhysioMcpPendingConsentRow = {
  id: string;
  practitioner_id: string;
  client_id: string;
  redirect_uri: string;
  scopes_json: string;
  oauth_query: string;
  csrf_token_hash: string;
  created_at_ms: number;
  expires_at_ms: number;
  consumed_at_ms: number | null;
};

export const PHYSIO_MCP_PENDING_CONSENT_TTL_MS = 10 * 60 * 1000;

export async function insertPhysioMcpPendingConsent(
  sql: SqlStoragePort,
  row: Omit<PhysioMcpPendingConsentRow, "consumed_at_ms">,
): Promise<void> {
  await sql.run(
    `INSERT INTO physio_mcp_pending_consent (
      id, practitioner_id, client_id, redirect_uri, scopes_json, oauth_query,
      csrf_token_hash, created_at_ms, expires_at_ms, consumed_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      row.id,
      row.practitioner_id,
      row.client_id,
      row.redirect_uri,
      row.scopes_json,
      row.oauth_query,
      row.csrf_token_hash,
      row.created_at_ms,
      row.expires_at_ms,
    ],
  );
}

export async function findPhysioMcpPendingConsentById(
  sql: SqlStoragePort,
  id: string,
): Promise<PhysioMcpPendingConsentRow | null> {
  return sql.first<PhysioMcpPendingConsentRow>(
    "SELECT * FROM physio_mcp_pending_consent WHERE id = ? LIMIT 1",
    [id],
  );
}

export async function markPhysioMcpPendingConsentConsumed(
  sql: SqlStoragePort,
  id: string,
  consumedAtMs: number,
): Promise<boolean> {
  const result = await sql.run(
    "UPDATE physio_mcp_pending_consent SET consumed_at_ms = ? WHERE id = ? AND consumed_at_ms IS NULL",
    [consumedAtMs, id],
  );
  return result.rowsAffected > 0;
}

export function isPhysioMcpPendingConsentUsable(
  row: PhysioMcpPendingConsentRow,
  nowMs: number,
): boolean {
  if (row.consumed_at_ms !== null) {
    return false;
  }
  return nowMs < row.expires_at_ms;
}
