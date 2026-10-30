import type { PractitionerSession } from "../auth/auth-port.js";
import { jsonForbidden, jsonUnauthorized } from "./responses.js";

export type RoutePractitionerBinding =
  { ok: true; practitionerId: string } | { ok: false; response: Response };

/**
 * Binds a path `:practitionerId` to the signed-in session. Reusable from HTTP routes and MCP later.
 */
export function bindRoutePractitionerId(
  pathPractitionerId: string,
  session: PractitionerSession | null,
): RoutePractitionerBinding {
  if (!session) {
    return { ok: false, response: jsonUnauthorized() };
  }
  if (session.practitionerId !== pathPractitionerId) {
    return { ok: false, response: jsonForbidden() };
  }
  return { ok: true, practitionerId: session.practitionerId };
}

export function resolveExerciseRoutePractitionerId(
  pathPractitionerId: string,
  session: PractitionerSession | null | undefined,
): string | Response {
  const bound = bindRoutePractitionerId(pathPractitionerId, session ?? null);
  if (!bound.ok) {
    return bound.response;
  }
  return bound.practitionerId;
}
