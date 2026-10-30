import type { AppDependencies } from "../app.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import {
  MyDefaultsService,
  MyDefaultsServiceError,
} from "../../services/my-defaults/index.js";
import { resolveExerciseRoutePractitionerId } from "../bind-route-practitioner.js";
import type { PractitionerSession } from "../../auth/auth-port.js";

const JSON_HEADERS = { "content-type": "application/json" };

const MY_DEFAULTS_PATH =
  /^\/api\/practitioners\/([^/]+)\/my-defaults(?:\/([^/]+)(?:\/([^/]+))?)?$/;

export function isMyDefaultsApiPath(pathname: string): boolean {
  return MY_DEFAULTS_PATH.test(pathname);
}

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

function bindPathPractitioner(
  pathPractitionerId: string,
  sessionPractitioner: PractitionerSession | null | undefined,
): string | Response {
  return resolveExerciseRoutePractitionerId(pathPractitionerId, sessionPractitioner);
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

export type HandleMyDefaultsOptions = {
  sessionPractitioner?: PractitionerSession | null;
};

export async function handleMyDefaultsRequest(
  request: Request,
  deps: AppDependencies,
  options: HandleMyDefaultsOptions = {},
): Promise<Response | null> {
  const sessionPractitioner = options.sessionPractitioner;
  const url = new URL(request.url);
  const match = MY_DEFAULTS_PATH.exec(url.pathname);
  if (!match) {
    return null;
  }
  const [, pathPractitionerId, segment, subSegment] = match;
  const practitionerId = bindPathPractitioner(pathPractitionerId, sessionPractitioner);
  if (practitionerId instanceof Response) {
    return practitionerId;
  }

  if (!segment && request.method === "GET") {
    try {
      const result = await service(deps).getPage(practitionerId);
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (segment === "share-link-expiry" && request.method === "PATCH") {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json(
        { error: "invalid_input", message: "Invalid JSON body" },
        { status: 400, headers: JSON_HEADERS },
      );
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
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return Response.json(
          { error: "invalid_input", message: "Invalid JSON body" },
          { status: 400, headers: JSON_HEADERS },
        );
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
      try {
        const result = await service(deps).resetTypeDefault(practitionerId, type);
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }
  }

  return null;
}
