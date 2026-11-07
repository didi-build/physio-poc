import type { AppDependencies } from "../app.js";
import type { PractitionerSession } from "../../auth/auth-port.js";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
} from "../../services/programs/index.js";
import {
  RoutinesLibraryService,
  RoutinesLibraryServiceError,
  parseRoutineMutationUndo,
  type RoutineSearchSort,
} from "../../services/routines/index.js";
import {
  ROUTINES_COMMUNITY_SEARCH_PATH,
  ROUTINES_MY_ROUTINES_PATH,
  routineDetailsPath,
  routineMyCopyPath,
  routineSentProgramsPath,
} from "../../routine-library-api-paths.js";
import { rejectBodyPractitionerId } from "../reject-body-practitioner-id.js";
import { requirePractitioner } from "../require-practitioner.js";

const JSON_HEADERS = { "content-type": "application/json" };

const ROUTINES_ME_PATH =
  /^\/api\/me\/(?:routines\/community\/search|my-routines(?:\/([^/]+))?|routines(?:\/([^/]+)(?:\/sent-programs)?)?)$/;

export function isRoutinesLibraryApiPath(pathname: string): boolean {
  return ROUTINES_ME_PATH.test(pathname);
}

function libraryService(deps: AppDependencies): RoutinesLibraryService {
  return new RoutinesLibraryService(deps.sql, deps.config);
}

function programService(deps: AppDependencies): ProgramBuilderService {
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
  if (error instanceof RoutinesLibraryServiceError) {
    const status =
      error.code === "practitioner_not_found" || error.code === "routine_not_found"
        ? 404
        : error.code === "my_routine_not_found"
          ? 404
          : error.code === "routine_not_published"
            ? 404
            : 400;
    return Response.json(
      { error: error.code, message: error.message },
      { status, headers: JSON_HEADERS },
    );
  }
  throw error;
}

function parseSort(raw: string | null): RoutineSearchSort | null {
  if (raw === "newest" || raw === "a_to_z" || raw === "most_used") {
    return raw;
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
  const path = url.pathname;
  const match = ROUTINES_ME_PATH.exec(path);
  if (!match) {
    return null;
  }

  const practitionerId = requirePractitioner(options.sessionPractitioner);
  if (practitionerId instanceof Response) {
    return practitionerId;
  }

  if (path === ROUTINES_COMMUNITY_SEARCH_PATH && request.method === "GET") {
    const sortParam = url.searchParams.get("sort");
    const sort =
      sortParam === null ? ("most_used" as RoutineSearchSort) : parseSort(sortParam);
    if (sort === null) {
      return Response.json(
        { error: "invalid_input", message: "Invalid sort" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const result = await libraryService(deps).searchCommunityRoutines({
        practitionerId,
        query: url.searchParams.get("q") ?? undefined,
        bodyRegion: url.searchParams.get("body_region") ?? undefined,
        conditionId: url.searchParams.get("condition_id") ?? undefined,
        sort,
        limit: url.searchParams.get("limit")
          ? Number(url.searchParams.get("limit"))
          : undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
      });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (path === ROUTINES_MY_ROUTINES_PATH && request.method === "GET") {
    try {
      const result = await libraryService(deps).listMyRoutines({
        practitionerId,
        query: url.searchParams.get("q") ?? undefined,
        bodyRegion: url.searchParams.get("body_region") ?? undefined,
        conditionId: url.searchParams.get("condition_id") ?? undefined,
      });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const myRoutineId = match[1];
  if (myRoutineId && path === routineMyCopyPath(myRoutineId)) {
    const routineId = safeDecodePathSegment(myRoutineId);
    if (routineId === null) {
      return Response.json(
        { error: "routine_not_found", message: "Routine not found" },
        { status: 404, headers: JSON_HEADERS },
      );
    }
    if (request.method === "DELETE") {
      try {
        const result = await libraryService(deps).removeFromMyRoutines(
          practitionerId,
          routineId,
        );
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (request.method === "POST") {
      const body = await readJsonObjectBody(request);
      if (body instanceof Response) {
        return body;
      }
      const rejected = rejectBodyPractitionerId(body);
      if (rejected) {
        return rejected;
      }
      const action = body.action;
      if (action === "save") {
        try {
          const result = await libraryService(deps).saveToMyRoutines(
            practitionerId,
            routineId,
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
      if (action === "adopt_community_version") {
        try {
          const result = await libraryService(deps).adoptCommunityVersion(
            practitionerId,
            routineId,
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
      if (action === "keep_my_copy") {
        try {
          const result = await libraryService(deps).keepMyCopyVersion(
            practitionerId,
            routineId,
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
      if (action === "undo") {
        try {
          const undoPayload = parseRoutineMutationUndo(body.undo);
          await libraryService(deps).applyUndo(practitionerId, routineId, undoPayload);
          return Response.json({ ok: true }, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
    }
    if (request.method === "PATCH") {
      const body = await readJsonObjectBody(request);
      if (body instanceof Response) {
        return body;
      }
      const rejected = rejectBodyPractitionerId(body);
      if (rejected) {
        return rejected;
      }
      if (!Array.isArray(body.rows)) {
        return Response.json(
          { error: "invalid_input", message: "rows must be an array" },
          { status: 400, headers: JSON_HEADERS },
        );
      }
      try {
        const rows = body.rows as {
          position: number;
          exercise_id: string;
          exercise_version_id: string;
          prescription_type: string;
          params: Record<string, unknown>;
        }[];
        const result = await libraryService(deps).updateMyCopy({
          practitionerId,
          routineId,
          rows: rows.map((row) => ({
            position: row.position,
            exerciseId: row.exercise_id,
            exerciseVersionId: row.exercise_version_id,
            prescriptionType: row.prescription_type as never,
            params: row.params as never,
          })),
        });
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }
  }

  const routineSegment = match[2];
  if (routineSegment) {
    const routineId = safeDecodePathSegment(routineSegment);
    if (routineId === null) {
      if (path.endsWith("/sent-programs")) {
        return programNotFoundResponse();
      }
      return Response.json(
        { error: "routine_not_found", message: "Routine not found" },
        { status: 404, headers: JSON_HEADERS },
      );
    }
    if (path === routineSentProgramsPath(routineId) && request.method === "GET") {
      try {
        const result = await programService(deps).getRoutineSentProgramStats(
          practitionerId,
          routineId,
        );
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (path === routineDetailsPath(routineId) && request.method === "GET") {
      try {
        const result = await libraryService(deps).getRoutineDetails(
          practitionerId,
          routineId,
        );
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
