import type { AppDependencies } from "../app.js";
import type { PractitionerSession } from "../../auth/auth-port.js";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
} from "../../services/programs/index.js";
import { requirePractitioner } from "../require-practitioner.js";

const JSON_HEADERS = { "content-type": "application/json" };

const ROUTINES_ME_PREFIX = /^\/api\/me\/routines(?:\/(.*))?$/;

function service(deps: AppDependencies): ProgramBuilderService {
  return new ProgramBuilderService(deps.sql);
}

function errorResponse(error: unknown): Response {
  if (error instanceof ProgramBuilderServiceError) {
    const status =
      error.code === "program_not_found" ||
      error.code === "program_row_not_found" ||
      error.code === "exercise_not_found" ||
      error.code === "exercise_request_not_found" ||
      error.code === "practitioner_not_found"
        ? 404
        : 400;
    return Response.json(
      { error: error.code, message: error.message },
      { status, headers: JSON_HEADERS },
    );
  }
  throw error;
}

function programNotFoundResponse(): Response {
  return Response.json(
    { error: "program_not_found", message: "Program not found" },
    { status: 404, headers: JSON_HEADERS },
  );
}

function safeDecodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export type HandleRoutinesOptions = {
  sessionPractitioner?: PractitionerSession | null;
};

export async function handleRoutinesRequest(
  request: Request,
  deps: AppDependencies,
  options: HandleRoutinesOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = ROUTINES_ME_PREFIX.exec(url.pathname);
  if (!match) {
    return null;
  }

  const practitionerId = requirePractitioner(options.sessionPractitioner);
  if (practitionerId instanceof Response) {
    return practitionerId;
  }

  const remainder = match[1] ?? "";
  const segments = remainder.split("/").filter((segment) => segment.length > 0);

  if (
    segments.length === 2 &&
    segments[1] === "sent-programs" &&
    request.method === "GET"
  ) {
    const routineIdRaw = safeDecodePathSegment(segments[0]!);
    if (routineIdRaw === null) {
      return programNotFoundResponse();
    }
    try {
      const result = await service(deps).getRoutineSentProgramStats(
        practitionerId,
        routineIdRaw,
      );
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  return Response.json(
    { error: "not_found", message: "Not found" },
    { status: 404, headers: JSON_HEADERS },
  );
}
