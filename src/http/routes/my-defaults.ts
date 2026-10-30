import type { AppDependencies } from "../app.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import {
  MyDefaultsService,
  MyDefaultsServiceError,
} from "../../services/my-defaults/index.js";
import type { PractitionerSession } from "../../auth/auth-port.js";
import { jsonUnauthorized } from "../responses.js";

const JSON_HEADERS = { "content-type": "application/json" };

const MY_DEFAULTS_ME_PATH = /^\/api\/me\/my-defaults(?:\/([^/]+)(?:\/([^/]+))?)?$/;

function service(deps: AppDependencies): MyDefaultsService {
  return new MyDefaultsService(deps.sql);
}

function errorResponse(error: unknown): Response {
  if (error instanceof MyDefaultsServiceError) {
    const status =
      error.code === "practitioner_not_found" || error.code === "type_not_found"
        ? 404
        : 400;
    return Response.json(
      { error: error.code, message: error.message },
      { status, headers: JSON_HEADERS },
    );
  }
  throw error;
}

function practitionerIdFromSession(
  sessionPractitioner: PractitionerSession | null | undefined,
): string | Response {
  if (!sessionPractitioner) {
    return jsonUnauthorized();
  }
  return sessionPractitioner.practitionerId;
}

function rejectBodyPractitionerId(body: Record<string, unknown>): Response | null {
  if (
    Object.prototype.hasOwnProperty.call(body, "practitionerId") ||
    Object.prototype.hasOwnProperty.call(body, "practitioner_id")
  ) {
    return Response.json(
      { error: "invalid_input", message: "invalid_input" },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  return null;
}

function rejectQueryPractitionerId(url: URL): Response | null {
  if (
    url.searchParams.has("practitionerId") ||
    url.searchParams.has("practitioner_id")
  ) {
    return Response.json(
      { error: "invalid_input", message: "invalid_input" },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  return null;
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

function parseExpiresIn(raw: unknown): ShareLinkExpiresIn | null {
  if (typeof raw !== "string") {
    return null;
  }
  return Object.values(SHARE_LINK_EXPIRES_IN).includes(raw as ShareLinkExpiresIn)
    ? (raw as ShareLinkExpiresIn)
    : null;
}

function parsePrescriptionType(raw: string | undefined): PrescriptionType | null {
  if (!raw) {
    return null;
  }
  return PRESCRIPTION_TYPES.includes(raw as PrescriptionType)
    ? (raw as PrescriptionType)
    : null;
}

type HandleMyDefaultsOptions = {
  sessionPractitioner?: PractitionerSession | null;
};

export async function handleMyDefaultsRequest(
  request: Request,
  deps: AppDependencies,
  options: HandleMyDefaultsOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = MY_DEFAULTS_ME_PATH.exec(url.pathname);
  if (!match) {
    return null;
  }

  const queryRejected = rejectQueryPractitionerId(url);
  if (queryRejected) {
    return queryRejected;
  }

  const practitionerId = practitionerIdFromSession(options.sessionPractitioner);
  if (practitionerId instanceof Response) {
    return practitionerId;
  }

  const [, segment, subSegment] = match;

  if (!segment && request.method === "GET") {
    try {
      const result = await service(deps).getPage(practitionerId);
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (segment === "share-link-expiry" && request.method === "PATCH") {
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const rejected = rejectBodyPractitionerId(body);
    if (rejected) {
      return rejected;
    }
    const expiresIn = parseExpiresIn(body.expires_in);
    if (!expiresIn) {
      return Response.json(
        { error: "invalid_input", message: "expires_in is required" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const result = await service(deps).updateShareLinkDefault(
        practitionerId,
        expiresIn,
      );
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (segment === "types" && subSegment) {
    const type = parsePrescriptionType(subSegment);
    if (!type) {
      return Response.json(
        { error: "type_not_found", message: "Unknown exercise type" },
        { status: 404, headers: JSON_HEADERS },
      );
    }
    if (request.method === "PUT") {
      const body = await readJsonObjectBody(request);
      if (body instanceof Response) {
        return body;
      }
      const rejected = rejectBodyPractitionerId(body);
      if (rejected) {
        return rejected;
      }
      if (
        !body.params ||
        typeof body.params !== "object" ||
        Array.isArray(body.params)
      ) {
        return Response.json(
          { error: "invalid_input", message: "params must be an object" },
          { status: 400, headers: JSON_HEADERS },
        );
      }
      try {
        const result = await service(deps).upsertTypeDefault(
          practitionerId,
          type,
          body.params as Record<string, unknown>,
        );
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (request.method === "DELETE") {
      if (request.headers.get("content-type")?.includes("application/json")) {
        const body = await readJsonObjectBody(request);
        if (body instanceof Response) {
          return body;
        }
        const rejected = rejectBodyPractitionerId(body);
        if (rejected) {
          return rejected;
        }
      }
      try {
        const result = await service(deps).resetTypeDefault(practitionerId, type);
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }
  }

  return Response.json(
    { error: "not_found", message: "Not found" },
    { status: 404, headers: JSON_HEADERS },
  );
}
