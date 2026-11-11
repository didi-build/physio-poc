import type { AppDependencies } from "../app.js";
import type { PractitionerSession } from "../../auth/auth-port.js";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
} from "../../services/programs/index.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import type { ExerciseParams } from "../../domain/exercise-params.js";
import {
  RoutineAuthoringService,
  RoutineAuthoringServiceError,
  RoutinesLibraryService,
  RoutinesLibraryServiceError,
  parseRoutineMutationUndo,
  type RoutineSearchSort,
} from "../../services/routines/index.js";
import {
  ROUTINES_AUTHORING_COLLECTION_PATH,
  routineVersionHistoryPath,
} from "../../routine-authoring-api-paths.js";
import {
  BODY_REGIONS_LIST_PATH,
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
  /^\/api\/me\/(?:routines\/community\/search|my-routines(?:\/([^/]+))?|routines(?:\/([^/]+)(?:\/(?:sent-programs|versions))?)?)$/;

export function isRoutinesLibraryApiPath(pathname: string): boolean {
  return (
    pathname === ROUTINES_AUTHORING_COLLECTION_PATH ||
    pathname === BODY_REGIONS_LIST_PATH ||
    ROUTINES_ME_PATH.test(pathname)
  );
}

function libraryService(deps: AppDependencies): RoutinesLibraryService {
  return new RoutinesLibraryService(deps.sql, deps.config);
}

function authoringService(deps: AppDependencies): RoutineAuthoringService {
  return new RoutineAuthoringService(deps.sql);
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
      error.code === "stale_write"
        ? 409
        : error.code === "practitioner_not_found" ||
            error.code === "routine_not_found" ||
            error.code === "my_routine_not_found" ||
            error.code === "routine_not_published" ||
            error.code === "exercise_not_found"
          ? 404
          : error.code === "undo_mismatch"
            ? 400
            : 400;
    return Response.json(
      { error: error.code, message: error.message },
      { status, headers: JSON_HEADERS },
    );
  }
  throw error;
}

function authoringErrorResponse(error: unknown): Response {
  if (error instanceof RoutineAuthoringServiceError) {
    const status =
      error.code === "stale_write"
        ? 409
        : error.code === "practitioner_not_found" || error.code === "routine_not_found"
          ? 404
          : error.code === "exercise_not_found"
            ? 404
            : 400;
    const body: Record<string, unknown> = {
      error: error.code,
      message: error.message,
    };
    if (error.code === "publish_validation_failed" && error.validation_issues) {
      body.validation_issues = error.validation_issues;
    }
    return Response.json(body, { status, headers: JSON_HEADERS });
  }
  return errorResponse(error);
}

function parsePrescriptionType(raw: unknown): PrescriptionType | null {
  if (typeof raw !== "string") {
    return null;
  }
  return PRESCRIPTION_TYPES.includes(raw as PrescriptionType)
    ? (raw as PrescriptionType)
    : null;
}

function parseAuthoringRows(raw: unknown):
  | {
      position: number;
      exerciseId: string;
      exerciseVersionId: string;
      prescriptionType: PrescriptionType;
      params: ExerciseParams;
    }[]
  | Response {
  if (!Array.isArray(raw)) {
    return Response.json(
      { error: "invalid_input", message: "rows must be an array" },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  const parsed: {
    position: number;
    exerciseId: string;
    exerciseVersionId: string;
    prescriptionType: PrescriptionType;
    params: ExerciseParams;
  }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return Response.json(
        { error: "invalid_input", message: "Invalid row" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const row = item as Record<string, unknown>;
    const prescriptionType = parsePrescriptionType(row.prescription_type);
    if (
      typeof row.position !== "number" ||
      typeof row.exercise_id !== "string" ||
      typeof row.exercise_version_id !== "string" ||
      !prescriptionType ||
      !row.params ||
      typeof row.params !== "object" ||
      Array.isArray(row.params)
    ) {
      return Response.json(
        { error: "invalid_input", message: "Invalid row" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    parsed.push({
      position: row.position,
      exerciseId: row.exercise_id,
      exerciseVersionId: row.exercise_version_id,
      prescriptionType,
      params: row.params as ExerciseParams,
    });
  }
  return parsed;
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

function rejectSpoofedPractitionerIdInBody(
  body: Record<string, unknown>,
  options: { allowUndoPayload?: boolean } = {},
): Response | null {
  if (options.allowUndoPayload) {
    const rest = { ...body };
    delete rest.undo;
    return rejectBodyPractitionerId(rest);
  }
  return rejectBodyPractitionerId(body);
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

  if (path === BODY_REGIONS_LIST_PATH) {
    if (request.method !== "GET") {
      return null;
    }
    const practitionerId = requirePractitioner(options.sessionPractitioner);
    if (practitionerId instanceof Response) {
      return practitionerId;
    }
    try {
      const regions = await libraryService(deps).listBodyRegions();
      return Response.json(regions, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const match = ROUTINES_ME_PATH.exec(path);
  if (!match) {
    return null;
  }

  const practitionerId = requirePractitioner(options.sessionPractitioner);
  if (practitionerId instanceof Response) {
    return practitionerId;
  }

  if (path === ROUTINES_AUTHORING_COLLECTION_PATH && request.method === "POST") {
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const rejected = rejectBodyPractitionerId(body);
    if (rejected) {
      return rejected;
    }
    if (typeof body.body_region_id !== "string" || body.body_region_id.trim() === "") {
      return Response.json(
        { error: "invalid_input", message: "body_region_id is required" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const result = await authoringService(deps).createDraft({
        practitionerId,
        bodyRegionId: body.body_region_id,
        conditionId:
          body.condition_id === null || typeof body.condition_id === "string"
            ? (body.condition_id as string | null | undefined)
            : undefined,
        whoItsFor:
          body.who_its_for === null || typeof body.who_its_for === "string"
            ? (body.who_its_for as string | null | undefined)
            : undefined,
        name:
          body.name === null || typeof body.name === "string"
            ? (body.name as string | null | undefined)
            : undefined,
      });
      return Response.json(result, { status: 201, headers: JSON_HEADERS });
    } catch (error) {
      return authoringErrorResponse(error);
    }
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
      const action = body.action;
      const rejected = rejectSpoofedPractitionerIdInBody(body, {
        allowUndoPayload: action === "undo",
      });
      if (rejected) {
        return rejected;
      }
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
    if (path === routineVersionHistoryPath(routineId) && request.method === "GET") {
      try {
        const result = await authoringService(deps).listVersionHistory(
          practitionerId,
          routineId,
        );
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return authoringErrorResponse(error);
      }
    }
    if (path === routineDetailsPath(routineId)) {
      if (request.method === "GET") {
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
      if (request.method === "PATCH") {
        const body = await readJsonObjectBody(request);
        if (body instanceof Response) {
          return body;
        }
        const rejected = rejectBodyPractitionerId(body);
        if (rejected) {
          return rejected;
        }
        let rows:
          | {
              position: number;
              exerciseId: string;
              exerciseVersionId: string;
              prescriptionType: PrescriptionType;
              params: ExerciseParams;
            }[]
          | undefined;
        if (body.rows !== undefined) {
          const parsedRows = parseAuthoringRows(body.rows);
          if (parsedRows instanceof Response) {
            return parsedRows;
          }
          rows = parsedRows;
        }
        try {
          const result = await authoringService(deps).autosaveDraft({
            practitionerId,
            routineId,
            bodyRegionId:
              typeof body.body_region_id === "string" ? body.body_region_id : undefined,
            conditionId:
              body.condition_id === null || typeof body.condition_id === "string"
                ? (body.condition_id as string | null | undefined)
                : undefined,
            whoItsFor:
              body.who_its_for === null || typeof body.who_its_for === "string"
                ? (body.who_its_for as string | null | undefined)
                : undefined,
            name:
              body.name === null || typeof body.name === "string"
                ? (body.name as string | null | undefined)
                : undefined,
            rows,
          });
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return authoringErrorResponse(error);
        }
      }
      if (request.method === "DELETE") {
        try {
          const result = await authoringService(deps).cancelUntouchedDraft(
            practitionerId,
            routineId,
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return authoringErrorResponse(error);
        }
      }
      if (request.method === "POST") {
        const body = await readJsonObjectBody(request);
        if (body instanceof Response) {
          return body;
        }
        const action = body.action;
        const rejected = rejectSpoofedPractitionerIdInBody(body, {
          allowUndoPayload: action === "undo_draft_discard",
        });
        if (rejected) {
          return rejected;
        }
        if (action === "publish") {
          try {
            const result = await authoringService(deps).publishDraft({
              practitionerId,
              routineId,
              name: typeof body.name === "string" ? body.name : undefined,
            });
            return Response.json(result, { headers: JSON_HEADERS });
          } catch (error) {
            return authoringErrorResponse(error);
          }
        }
        if (action === "discard_draft") {
          try {
            const result = await authoringService(deps).discardDraft(
              practitionerId,
              routineId,
            );
            return Response.json(result, { headers: JSON_HEADERS });
          } catch (error) {
            return authoringErrorResponse(error);
          }
        }
        if (action === "undo_draft_discard") {
          try {
            await authoringService(deps).undoDiscardDraft(
              practitionerId,
              routineId,
              body.undo,
            );
            return Response.json({ ok: true }, { headers: JSON_HEADERS });
          } catch (error) {
            return authoringErrorResponse(error);
          }
        }
        if (action === "save_community_version") {
          const parsedRows = parseAuthoringRows(body.rows);
          if (parsedRows instanceof Response) {
            return parsedRows;
          }
          if (typeof body.name !== "string" || body.name.trim() === "") {
            return Response.json(
              { error: "invalid_input", message: "name is required" },
              { status: 400, headers: JSON_HEADERS },
            );
          }
          if (typeof body.expected_published_version !== "number") {
            return Response.json(
              {
                error: "invalid_input",
                message: "expected_published_version is required",
              },
              { status: 400, headers: JSON_HEADERS },
            );
          }
          try {
            const result = await authoringService(deps).saveCommunityVersion({
              practitionerId,
              routineId,
              expectedPublishedVersion: body.expected_published_version,
              name: body.name,
              changeSummary:
                body.change_summary === null || typeof body.change_summary === "string"
                  ? (body.change_summary as string | null | undefined)
                  : undefined,
              rows: parsedRows,
              conditionId:
                body.condition_id === null || typeof body.condition_id === "string"
                  ? (body.condition_id as string | null | undefined)
                  : undefined,
              bodyRegionId:
                typeof body.body_region_id === "string"
                  ? body.body_region_id
                  : undefined,
              whoItsFor:
                body.who_its_for === null || typeof body.who_its_for === "string"
                  ? (body.who_its_for as string | null | undefined)
                  : undefined,
            });
            return Response.json(result, { headers: JSON_HEADERS });
          } catch (error) {
            return authoringErrorResponse(error);
          }
        }
        if (action === "restore_version") {
          if (typeof body.restore_from_version_number !== "number") {
            return Response.json(
              {
                error: "invalid_input",
                message: "restore_from_version_number is required",
              },
              { status: 400, headers: JSON_HEADERS },
            );
          }
          try {
            const result = await authoringService(deps).restoreVersion({
              practitionerId,
              routineId,
              restoreFromVersionNumber: body.restore_from_version_number,
            });
            return Response.json(result, { headers: JSON_HEADERS });
          } catch (error) {
            return authoringErrorResponse(error);
          }
        }
      }
    }
  }

  return Response.json(
    { error: "not_found", message: "Not found" },
    { status: 404, headers: JSON_HEADERS },
  );
}
