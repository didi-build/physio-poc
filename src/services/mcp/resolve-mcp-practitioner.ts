import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";

export type McpAccessTokenClaims = {
  sub?: unknown;
};

/** Resolves the bound practitioner id for a verified MCP OAuth access token. */
export async function resolvePractitionerIdForMcpAccessToken(
  sql: SqlStoragePort,
  claims: McpAccessTokenClaims,
): Promise<string | null> {
  const userId = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!userId) {
    return null;
  }
  const row = await sql.first<{ practitionerId: string | null }>(
    'SELECT "practitionerId" as practitionerId FROM "user" WHERE id = ? LIMIT 1',
    [userId],
  );
  const practitionerId =
    typeof row?.practitionerId === "string" ? row.practitionerId.trim() : "";
  return practitionerId.length > 0 ? practitionerId : null;
}
