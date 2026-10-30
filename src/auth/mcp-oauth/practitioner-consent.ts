import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";

export type PhysioMcpPractitionerConsentRow = {
  id: string;
  practitioner_id: string;
  client_id: string;
  redirect_uri: string;
  scopes_json: string;
  created_at: string;
};

export async function insertPhysioMcpPractitionerConsent(
  sql: SqlStoragePort,
  row: PhysioMcpPractitionerConsentRow,
): Promise<void> {
  await sql.run(
    `INSERT INTO physio_mcp_practitioner_consent (
      id, practitioner_id, client_id, redirect_uri, scopes_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.practitioner_id,
      row.client_id,
      row.redirect_uri,
      row.scopes_json,
      row.created_at,
    ],
  );
}

export async function listPhysioMcpPractitionerConsentsForClient(
  sql: SqlStoragePort,
  practitionerId: string,
  clientId: string,
): Promise<PhysioMcpPractitionerConsentRow[]> {
  return sql.all<PhysioMcpPractitionerConsentRow>(
    `SELECT * FROM physio_mcp_practitioner_consent
     WHERE practitioner_id = ? AND client_id = ?
     ORDER BY created_at ASC`,
    [practitionerId, clientId],
  );
}

export async function deleteOAuthConsentRecordsForUserClient(
  sql: SqlStoragePort,
  userId: string,
  clientId: string,
): Promise<void> {
  await sql.run('DELETE FROM "oauthConsent" WHERE userId = ? AND clientId = ?', [
    userId,
    clientId,
  ]);
}
