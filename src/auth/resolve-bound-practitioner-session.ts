import { isEmailAllowlisted } from "./allowed-emails.js";
import type { PractitionerSession } from "./auth-port.js";
import type { PhysioAuthConfig } from "../http/config.js";
import type { SqlStoragePort } from "../storage/ports/sql-storage.js";
import {
  findPractitionerByEmail,
  findPractitionerById,
} from "../storage/repositories/practitioner-auth.js";

export type BoundSessionInput = {
  email: string | null | undefined;
  name: string | null | undefined;
  boundPractitionerId: string | null | undefined;
  sessionToken: string | null | undefined;
};

export type ResolveBoundPractitionerResult =
  | { ok: true; session: PractitionerSession }
  | { ok: false; shouldDeleteSession: boolean };

export async function resolveBoundPractitionerSession(
  sql: SqlStoragePort,
  authConfig: PhysioAuthConfig,
  input: BoundSessionInput,
): Promise<ResolveBoundPractitionerResult> {
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email) {
    return { ok: false, shouldDeleteSession: Boolean(input.sessionToken) };
  }
  if (!isEmailAllowlisted(authConfig.allowedGoogleEmails, email)) {
    return { ok: false, shouldDeleteSession: true };
  }
  const boundId =
    typeof input.boundPractitionerId === "string"
      ? input.boundPractitionerId.trim()
      : "";
  if (!boundId) {
    return { ok: false, shouldDeleteSession: true };
  }
  const practitioner = await findPractitionerById(sql, boundId);
  if (!practitioner) {
    return { ok: false, shouldDeleteSession: true };
  }
  const practitionerByEmail = await findPractitionerByEmail(sql, email);
  if (!practitionerByEmail || practitionerByEmail.id !== practitioner.id) {
    return { ok: false, shouldDeleteSession: true };
  }
  const displayName =
    typeof input.name === "string" && input.name.trim().length > 0
      ? input.name.trim()
      : practitioner.email;
  return {
    ok: true,
    session: {
      practitionerId: practitioner.id,
      email: practitioner.email,
      displayName,
    },
  };
}

export async function deleteAuthSessionByToken(
  sql: SqlStoragePort,
  sessionToken: string,
): Promise<void> {
  await sql.run('DELETE FROM "session" WHERE token = ?', [sessionToken]);
}
