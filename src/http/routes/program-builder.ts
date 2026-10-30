import type { AppDependencies } from "../app.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { PractitionerSession } from "../../auth/auth-port.js";
import { ExerciseRequestsRepository } from "../../storage/repositories/exercise-data.js";
import {
  ProgramBuilderService,
  ProgramBuilderServiceError,
} from "../../services/programs/index.js";
import { rejectBodyPractitionerId } from "../reject-body-practitioner-id.js";
import { requirePractitioner } from "../require-practitioner.js";

const JSON_HEADERS = { "content-type": "application/json" };

const PROGRAMS_ME_PREFIX = /^\/api\/me\/programs(?:\/(.*))?$/;

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

function parsePrescriptionType(raw: unknown): PrescriptionType | null {
  if (typeof raw !== "string") {
    return null;
  }
  return PRESCRIPTION_TYPES.includes(raw as PrescriptionType)
    ? (raw as PrescriptionType)
    : null;
}

function parseParams(raw: unknown): ExerciseParams | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  return raw as ExerciseParams;
}

function parseStringField(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return value;
}

export type HandleProgramBuilderOptions = {
  sessionPractitioner?: PractitionerSession | null;
};

export async function handleProgramBuilderRequest(
  request: Request,
  deps: AppDependencies,
  options: HandleProgramBuilderOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = PROGRAMS_ME_PREFIX.exec(url.pathname);
  if (!match) {
    return null;
  }

  const practitionerId = requirePractitioner(options.sessionPractitioner);
  if (practitionerId instanceof Response) {
    return practitionerId;
  }

  const remainder = match[1] ?? "";

  if (remainder === "" && request.method === "GET") {
    try {
      const searchQuery = url.searchParams.get("q") ?? undefined;
      const result = await service(deps).listPrograms(practitionerId, {
        searchQuery,
      });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (remainder === "" && request.method === "POST") {
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const rejected = rejectBodyPractitionerId(body);
    if (rejected) {
      return rejected;
    }
    const programId = parseStringField(body, "program_id");
    if (!programId) {
      return Response.json(
        { error: "invalid_input", message: "program_id is required" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const name =
      body.name === undefined
        ? undefined
        : body.name === null
          ? null
          : typeof body.name === "string"
            ? body.name
            : null;
    if (
      body.name !== undefined &&
      body.name !== null &&
      typeof body.name !== "string"
    ) {
      return Response.json(
        { error: "invalid_input", message: "name must be a string or null" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const result = await service(deps).createProgram(practitionerId, {
        programId,
        name,
      });
      return Response.json(result, { status: 201, headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (remainder === "deleted" && request.method === "GET") {
    try {
      const items = await service(deps).listRecentlyDeletedPrograms(practitionerId);
      return Response.json({ items }, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (remainder === "link-approved-placeholders" && request.method === "POST") {
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const rejected = rejectBodyPractitionerId(body);
    if (rejected) {
      return rejected;
    }
    const exerciseRequestId = parseStringField(body, "exercise_request_id");
    const approvedVersionId = parseStringField(body, "approved_version_id");
    if (!exerciseRequestId || !approvedVersionId) {
      return Response.json(
        {
          error: "invalid_input",
          message: "exercise_request_id and approved_version_id are required",
        },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const requests = new ExerciseRequestsRepository(deps.sql);
    const exerciseRequest = await requests.findById(exerciseRequestId);
    if (!exerciseRequest || exerciseRequest.requested_by !== practitionerId) {
      return Response.json(
        { error: "exercise_request_not_found", message: "Exercise request not found" },
        { status: 404, headers: JSON_HEADERS },
      );
    }
    try {
      const skippedCount = await service(deps).linkApprovedPlaceholders(
        exerciseRequestId,
        approvedVersionId,
      );
      return Response.json({ skipped_count: skippedCount }, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const segments = remainder.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return Response.json(
      { error: "not_found", message: "Not found" },
      { status: 404, headers: JSON_HEADERS },
    );
  }

  const programId = decodeURIComponent(segments[0]!);

  if (segments.length === 1 && request.method === "GET") {
    try {
      const result = await service(deps).getProgram(practitionerId, programId);
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (segments.length === 1 && request.method === "PATCH") {
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const rejected = rejectBodyPractitionerId(body);
    if (rejected) {
      return rejected;
    }
    if (!Object.prototype.hasOwnProperty.call(body, "name")) {
      return Response.json(
        { error: "invalid_input", message: "name is required" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const name =
      body.name === null ? null : typeof body.name === "string" ? body.name : undefined;
    if (name === undefined) {
      return Response.json(
        { error: "invalid_input", message: "name must be a string or null" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const result = await service(deps).updateProgramName(
        practitionerId,
        programId,
        name,
      );
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (segments.length === 1 && request.method === "DELETE") {
    try {
      const result = await service(deps).deleteProgram(practitionerId, programId);
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (segments.length === 2 && segments[1] === "restore" && request.method === "POST") {
    try {
      const result = await service(deps).restoreProgram(practitionerId, programId);
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (segments[1] === "rows") {
    if (segments.length === 2 && request.method === "POST") {
      const body = await readJsonObjectBody(request);
      if (body instanceof Response) {
        return body;
      }
      const rejected = rejectBodyPractitionerId(body, { deep: true });
      if (rejected) {
        return rejected;
      }
      const rowId = parseStringField(body, "row_id");
      if (!rowId) {
        return Response.json(
          { error: "invalid_input", message: "row_id is required" },
          { status: 400, headers: JSON_HEADERS },
        );
      }
      const exerciseRequestId = parseStringField(body, "exercise_request_id");
      const exerciseId = parseStringField(body, "exercise_id");
      const note =
        body.note === undefined
          ? undefined
          : body.note === null
            ? null
            : typeof body.note === "string"
              ? body.note
              : undefined;
      if (body.note !== undefined && note === undefined) {
        return Response.json(
          { error: "invalid_input", message: "note must be a string or null" },
          { status: 400, headers: JSON_HEADERS },
        );
      }
      const params = parseParams(body.params);
      if (body.params !== undefined && params === undefined) {
        return Response.json(
          { error: "invalid_input", message: "params must be an object" },
          { status: 400, headers: JSON_HEADERS },
        );
      }
      try {
        if (exerciseRequestId) {
          const prescriptionType = parsePrescriptionType(body.prescription_type);
          if (!prescriptionType) {
            return Response.json(
              {
                error: "invalid_input",
                message: `prescriptionType must be one of: ${PRESCRIPTION_TYPES.join(", ")}`,
              },
              { status: 400, headers: JSON_HEADERS },
            );
          }
          const result = await service(deps).addPlaceholderRow(
            practitionerId,
            programId,
            {
              rowId,
              exerciseRequestId,
              prescriptionType,
              params,
              note,
            },
          );
          return Response.json(result, { headers: JSON_HEADERS });
        }
        if (!exerciseId) {
          return Response.json(
            {
              error: "invalid_input",
              message: "exercise_id or exercise_request_id is required",
            },
            { status: 400, headers: JSON_HEADERS },
          );
        }
        const exerciseVersionId =
          parseStringField(body, "exercise_version_id") ?? undefined;
        const prescriptionTypeRaw = body.prescription_type;
        const prescriptionType =
          prescriptionTypeRaw === undefined
            ? undefined
            : parsePrescriptionType(prescriptionTypeRaw);
        if (prescriptionTypeRaw !== undefined && !prescriptionType) {
          return Response.json(
            {
              error: "invalid_input",
              message: `prescriptionType must be one of: ${PRESCRIPTION_TYPES.join(", ")}`,
            },
            { status: 400, headers: JSON_HEADERS },
          );
        }
        const result = await service(deps).addExerciseRow(practitionerId, programId, {
          rowId,
          exerciseId,
          exerciseVersionId,
          prescriptionType: prescriptionType ?? undefined,
          params,
          note,
        });
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (
      segments.length === 3 &&
      segments[2] === "reorder" &&
      request.method === "PATCH"
    ) {
      const body = await readJsonObjectBody(request);
      if (body instanceof Response) {
        return body;
      }
      const rejected = rejectBodyPractitionerId(body, { deep: true });
      if (rejected) {
        return rejected;
      }
      const ordered = body.ordered_row_ids;
      if (!Array.isArray(ordered) || ordered.some((id) => typeof id !== "string")) {
        return Response.json(
          {
            error: "invalid_input",
            message: "ordered_row_ids must be an array of strings",
          },
          { status: 400, headers: JSON_HEADERS },
        );
      }
      try {
        const result = await service(deps).reorderRows(
          practitionerId,
          programId,
          ordered,
        );
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (segments.length === 3 && segments[2] !== "reorder") {
      const rowId = decodeURIComponent(segments[2]!);

      if (request.method === "PATCH") {
        const body = await readJsonObjectBody(request);
        if (body instanceof Response) {
          return body;
        }
        const rejected = rejectBodyPractitionerId(body, { deep: true });
        if (rejected) {
          return rejected;
        }
        const prescriptionTypeRaw = body.prescription_type;
        const prescriptionType =
          prescriptionTypeRaw === undefined
            ? undefined
            : parsePrescriptionType(prescriptionTypeRaw);
        if (prescriptionTypeRaw !== undefined && !prescriptionType) {
          return Response.json(
            {
              error: "invalid_input",
              message: `prescriptionType must be one of: ${PRESCRIPTION_TYPES.join(", ")}`,
            },
            { status: 400, headers: JSON_HEADERS },
          );
        }
        const params = parseParams(body.params);
        if (body.params !== undefined && params === undefined) {
          return Response.json(
            { error: "invalid_input", message: "params must be an object" },
            { status: 400, headers: JSON_HEADERS },
          );
        }
        const note =
          body.note === undefined
            ? undefined
            : body.note === null
              ? null
              : typeof body.note === "string"
                ? body.note
                : undefined;
        if (body.note !== undefined && note === undefined) {
          return Response.json(
            { error: "invalid_input", message: "note must be a string or null" },
            { status: 400, headers: JSON_HEADERS },
          );
        }
        try {
          const result = await service(deps).updateRow(
            practitionerId,
            programId,
            rowId,
            {
              prescriptionType: prescriptionType ?? undefined,
              params,
              note,
            },
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }

      if (request.method === "DELETE") {
        try {
          const result = await service(deps).removeRow(
            practitionerId,
            programId,
            rowId,
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
    }

    if (segments.length === 4 && segments[2] && segments[3] === "duplicate") {
      const rowId = decodeURIComponent(segments[2]!);
      if (request.method === "POST") {
        const body = await readJsonObjectBody(request);
        if (body instanceof Response) {
          return body;
        }
        const rejected = rejectBodyPractitionerId(body, { deep: true });
        if (rejected) {
          return rejected;
        }
        const newRowId = parseStringField(body, "new_row_id");
        if (!newRowId) {
          return Response.json(
            { error: "invalid_input", message: "new_row_id is required" },
            { status: 400, headers: JSON_HEADERS },
          );
        }
        try {
          const result = await service(deps).duplicateRow(practitionerId, programId, {
            sourceRowId: rowId,
            newRowId,
          });
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
    }

    if (segments.length === 5 && segments[2] && segments[3] === "library-update") {
      const rowId = decodeURIComponent(segments[2]!);
      if (segments[4] === "apply" && request.method === "POST") {
        try {
          const result = await service(deps).applyLibraryUpdateToRow(
            practitionerId,
            programId,
            rowId,
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
      if (segments[4] === "keep" && request.method === "POST") {
        try {
          const result = await service(deps).keepLibraryUpdateForRow(
            practitionerId,
            programId,
            rowId,
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
    }
  }

  return Response.json(
    { error: "not_found", message: "Not found" },
    { status: 404, headers: JSON_HEADERS },
  );
}

export function isProgramBuilderApiPath(pathname: string): boolean {
  return pathname === "/api/me/programs" || pathname.startsWith("/api/me/programs/");
}
