import type { PractitionerSession } from "../auth/auth-port.js";
import { jsonUnauthorized } from "./responses.js";

/** Session-only practitioner id for `/api/me/...` routes (DIDI-1006 route convention 152da896). */
export function requirePractitioner(
  session: PractitionerSession | null | undefined,
): string | Response {
  if (!session) {
    return jsonUnauthorized();
  }
  return session.practitionerId;
}
