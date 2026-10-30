import type { SqlStoragePort } from "../ports/sql-storage.js";

export type PractitionerRow = {
  id: string;
  email: string;
};

export async function findPractitionerByEmail(
  sql: SqlStoragePort,
  email: string,
): Promise<PractitionerRow | null> {
  const normalized = email.trim().toLowerCase();
  return sql.first<PractitionerRow>(
    "SELECT id, email FROM practitioners WHERE email = ? LIMIT 1",
    [normalized],
  );
}
