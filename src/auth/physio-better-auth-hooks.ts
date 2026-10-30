import { ALLOWLIST_REFUSAL_ERROR, isEmailAllowlisted } from "./allowed-emails.js";
import {
  stripClientPractitionerId,
  stripPhysioUserImage,
} from "./better-auth-minimal-storage.js";
import type { PhysioAuthConfig } from "../http/config.js";
import type { SqlStoragePort } from "../storage/ports/sql-storage.js";
import { findPractitionerByEmail } from "../storage/repositories/practitioner-auth.js";

export class PhysioPractitionerBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhysioPractitionerBindingError";
  }
}

export { ALLOWLIST_REFUSAL_ERROR };

function isVerifiedEmail(user: Record<string, unknown>): boolean {
  return (
    user.emailVerified === true ||
    (user as { email_verified?: boolean }).email_verified === true
  );
}

export async function runPhysioUserCreateBeforeHook(
  sql: SqlStoragePort,
  authConfig: PhysioAuthConfig,
  user: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> }> {
  const cleaned = stripClientPractitionerId(stripPhysioUserImage(user));
  const email = typeof cleaned.email === "string" ? cleaned.email : null;
  if (!isVerifiedEmail(cleaned)) {
    throw new PhysioPractitionerBindingError("user_create_unverified");
  }
  if (!isEmailAllowlisted(authConfig.allowedGoogleEmails, email)) {
    throw new PhysioPractitionerBindingError("user_create_not_allowlisted");
  }
  const practitioner = email ? await findPractitionerByEmail(sql, email) : null;
  if (!practitioner) {
    throw new PhysioPractitionerBindingError("user_create_no_practitioner");
  }
  return {
    data: {
      ...cleaned,
      practitionerId: practitioner.id,
    },
  };
}

export async function runPhysioUserUpdateBeforeHook(
  user: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> }> {
  return { data: stripClientPractitionerId(stripPhysioUserImage(user)) };
}

export async function bindPractitionerForSessionUser(
  sql: SqlStoragePort,
  session: Record<string, unknown>,
): Promise<void> {
  const userId = typeof session.userId === "string" ? session.userId.trim() : "";
  if (!userId) {
    throw new PhysioPractitionerBindingError("session_missing_user");
  }
  const userRow = await sql.first<{
    email: string | null;
    practitionerId: string | null;
  }>(
    'SELECT email, "practitionerId" as practitionerId FROM "user" WHERE id = ? LIMIT 1',
    [userId],
  );
  const email = typeof userRow?.email === "string" ? userRow.email : null;
  if (!email) {
    throw new PhysioPractitionerBindingError("session_user_missing_email");
  }
  const practitioner = await findPractitionerByEmail(sql, email);
  if (!practitioner) {
    throw new PhysioPractitionerBindingError("practitioner_row_missing");
  }
  const boundId =
    typeof userRow?.practitionerId === "string" ? userRow.practitionerId.trim() : "";
  if (boundId && boundId !== practitioner.id) {
    throw new PhysioPractitionerBindingError("practitioner_id_email_mismatch");
  }
  await sql.run('UPDATE "user" SET "practitionerId" = ? WHERE id = ?', [
    practitioner.id,
    userId,
  ]);
}
