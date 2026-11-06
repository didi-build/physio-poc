import type { PractitionerSession } from "../../auth/auth-port.js";
import type { PractitionerSessionView } from "../../services/practitioner-session/types.js";
import { PRACTITIONER_SESSION_API_PATH } from "../../practitioner-session-api-paths.js";
import type { AppDependencies } from "../app.js";
import { requirePractitioner } from "../require-practitioner.js";

const JSON_HEADERS = { "content-type": "application/json" };

type HandlePractitionerSessionOptions = {
  sessionPractitioner?: PractitionerSession | null;
};

function sessionView(session: PractitionerSession): PractitionerSessionView {
  return {
    practitioner_id: session.practitionerId,
    display_name: session.displayName,
  };
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
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers: JSON_HEADERS },
    );
  }
  const practitionerId = requirePractitioner(options.sessionPractitioner);
  if (practitionerId instanceof Response) {
    return practitionerId;
  }
  const session = options.sessionPractitioner;
  if (!session) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: JSON_HEADERS },
    );
  }
  return Response.json(sessionView(session), { status: 200, headers: JSON_HEADERS });
}
