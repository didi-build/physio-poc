import type { AppDependencies } from "../app.js";
import type { PractitionerSession } from "../../auth/auth-port.js";
import {
  ProgramPublishService,
  ProgramPublishServiceError,
  parseShareLinkExpiryBody,
} from "../../services/programs/index.js";
import { rejectBodyPractitionerId } from "../reject-body-practitioner-id.js";
import { requirePractitioner } from "../require-practitioner.js";
import { safeDecodePathSegment } from "../safe-decode-path-segment.js";

const JSON_HEADERS = { "content-type": "application/json" };

const PROGRAM_PUBLISH_ME_PATH = /^\/api\/me\/programs\/([^/]+)\/(publish|share-link)$/;

function service(deps: AppDependencies): ProgramPublishService {
  return new ProgramPublishService(deps.sql, deps.config.webAppBaseUrl);
}

function errorResponse(error: unknown): Response {
  if (error instanceof ProgramPublishServiceError) {
    const status =
      error.code === "program_not_found" || error.code === "practitioner_not_found"
        ? 404
        : 400;
    return Response.json(
      { error: error.code, message: error.message },
      { status, headers: JSON_HEADERS },
    );
  }
  throw error;
}

async function readJsonObjectBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json(
        { error: "invalid_input", message: "Invalid JSON body" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    return body as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "invalid_input", message: "Invalid JSON body" },
      { status: 400, headers: JSON_HEADERS },
    );
  }
}

type HandleProgramPublishOptions = {
  sessionPractitioner?: PractitionerSession | null;
};

export async function handleProgramPublishRequest(
  request: Request,
  deps: AppDependencies,
  options: HandleProgramPublishOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = PROGRAM_PUBLISH_ME_PATH.exec(url.pathname);
  if (!match) {
    return null;
  }

  const practitionerId = requirePractitioner(options.sessionPractitioner);
  if (practitionerId instanceof Response) {
    return practitionerId;
  }

  const programIdRaw = match[1]!;
  const programId = safeDecodePathSegment(programIdRaw);
  if (programId === null) {
    return Response.json(
      { error: "program_not_found", message: "Program not found" },
      { status: 404, headers: JSON_HEADERS },
    );
  }
  const action = match[2]!;

  if (action === "publish" && request.method === "POST") {
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const rejected = rejectBodyPractitionerId(body);
    if (rejected) {
      return rejected;
    }
    let linkExpiry;
    if (body.expires_in !== undefined) {
      try {
        linkExpiry = parseShareLinkExpiryBody(body);
      } catch (error) {
        return errorResponse(error);
      }
    }
    try {
      const result = await service(deps).publishProgram(practitionerId, programId, {
        linkExpiry,
      });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (action === "share-link" && request.method === "GET") {
    try {
      const result = await service(deps).getShareConnectorView(
        practitionerId,
        programId,
      );
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (action === "share-link" && request.method === "PATCH") {
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const rejected = rejectBodyPractitionerId(body);
    if (rejected) {
      return rejected;
    }
    try {
      const choice = parseShareLinkExpiryBody(body);
      const result = await service(deps).setProgramLinkExpiry(
        practitionerId,
        programId,
        choice,
      );
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (action === "share-link" && request.method === "DELETE") {
    try {
      const result = await service(deps).closeShareLink(practitionerId, programId);
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  return Response.json(
    { error: "method_not_allowed" },
    { status: 405, headers: JSON_HEADERS },
  );
}
