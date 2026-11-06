import type { PractitionerSession } from "../../auth/auth-port.js";
import type { PractitionerSessionView } from "../../services/practitioner-session/types.js";
import { PRACTITIONER_SESSION_API_PATH } from "../../practitioner-session-api-paths.js";
import type { AppDependencies } from "../app.js";

export const PRACTITIONER_SESSION_JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
} as const;

type HandlePractitionerSessionOptions = {
  sessionPractitioner?: PractitionerSession | null;
};

function sessionView(session: PractitionerSession): PractitionerSessionView {
  return {
    practitioner_id: session.practitionerId,
    display_name: session.displayName,
  };
}

function sessionJsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: PRACTITIONER_SESSION_JSON_HEADERS,
  });
}

export async function handlePractitionerSessionRequest(
  request: Request,
  _deps: AppDependencies,
  options: HandlePractitionerSessionOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== PRACTITIONER_SESSION_API_PATH) {
    return null;
  }
  if (request.method !== "GET") {
    return sessionJsonResponse({ error: "method_not_allowed" }, 405);
  }
  const session = options.sessionPractitioner;
  if (!session) {
    return sessionJsonResponse({ error: "unauthorized" }, 401);
  }
  return sessionJsonResponse(sessionView(session), 200);
}
