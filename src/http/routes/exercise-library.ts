import type { AppDependencies } from "../app.js";
import { parseExerciseCategoryLabel } from "../../domain/exercise-category-labels.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import { FreeTextValidationError } from "../../domain/exercise-free-text.js";
import {
  TextOverrideLegacyShapeError,
  TextOverrideValidationError,
  TEXT_OVERRIDE_KEYS,
  type TextOverrideKey,
} from "../../domain/exercise-text-overrides.js";
import {
  ExerciseLibraryService,
  ExerciseLibraryServiceError,
  parseExerciseMutationUndo,
  type ExerciseSearchSort,
} from "../../services/exercise-library/index.js";
import { resolveExerciseRoutePractitionerId } from "../bind-route-practitioner.js";
import type { PractitionerSession } from "../../auth/auth-port.js";

const JSON_HEADERS = { "content-type": "application/json" };

export function isExerciseLibraryApiPath(pathname: string): boolean {
  return /^\/api\/practitioners\/[^/]+\/(exercises\/approved\/search|exercises\/[^/]+|my-exercises(?:\/[^/]+)?)$/.test(
    pathname,
  );
}

export type ExerciseLibraryPractitionerPathHttpRouteCase = {
  readonly method: string;
  readonly path: string;
};

/** Sample paths for exercise library routes with a `:practitionerId` path segment. */
export function exerciseLibraryPractitionerPathHttpRouteCases(
  practitionerId: string,
  exerciseId: string,
): readonly ExerciseLibraryPractitionerPathHttpRouteCase[] {
  const base = `/api/practitioners/${practitionerId}`;
  const itemPath = `${base}/my-exercises/${exerciseId}`;
  return [
    { method: "GET", path: `${base}/exercises/approved/search` },
    { method: "GET", path: `${base}/exercises/${exerciseId}` },
    { method: "GET", path: `${base}/my-exercises` },
    { method: "POST", path: itemPath },
    { method: "PATCH", path: itemPath },
    { method: "DELETE", path: itemPath },
  ];
}

function service(deps: AppDependencies): ExerciseLibraryService {
  return new ExerciseLibraryService(deps.sql, deps.config);
}

function errorResponse(error: unknown): Response {
  if (error instanceof TextOverrideLegacyShapeError) {
    return Response.json(
      {
        error: "text_overrides_invalid_shape",
        message: error.message,
      },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  if (error instanceof TextOverrideValidationError) {
    return Response.json(
      { error: "invalid_input", message: error.message },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  if (error instanceof FreeTextValidationError) {
    return Response.json(
      { error: "invalid_input", message: error.message },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  if (error instanceof ExerciseLibraryServiceError) {
    const status =
      error.code === "practitioner_not_found" || error.code === "exercise_not_found"
        ? 404
        : error.code === "my_exercise_not_found"
          ? 404
          : error.code === "invalid_input" ||
              error.code === "undo_mismatch" ||
              error.code === "text_overrides_invalid_shape"
            ? 400
            : 400;
    return Response.json(
      { error: error.code, message: error.message },
      { status, headers: JSON_HEADERS },
    );
  }
  throw error;
}

function parseSort(raw: string | null): ExerciseSearchSort | null {
  if (raw === "newest" || raw === "a_to_z" || raw === "most_used") {
    return raw;
  }
  return null;
}

function parsePrescriptionType(raw: string | null): PrescriptionType | undefined {
  if (!raw) {
    return undefined;
  }
  return PRESCRIPTION_TYPES.includes(raw as PrescriptionType)
    ? (raw as PrescriptionType)
    : undefined;
}
function parseTextOverridePatch(
  raw: unknown,
): Partial<Record<TextOverrideKey, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TextOverrideValidationError("Text overrides must be a JSON object");
  }
  const result: Partial<Record<TextOverrideKey, string>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!TEXT_OVERRIDE_KEYS.includes(key as TextOverrideKey)) {
      throw new TextOverrideValidationError(`Unknown text override key: ${key}`);
    }
    if (typeof value !== "string") {
      throw new TextOverrideValidationError(`Override ${key} value must be a string`);
    }
    result[key as TextOverrideKey] = value;
  }
  return result;
}

function bindPathPractitioner(
  pathPractitionerId: string,
  sessionPractitioner: PractitionerSession | null | undefined,
): string | Response {
  return resolveExerciseRoutePractitionerId(pathPractitionerId, sessionPractitioner);
}

export type HandleExerciseLibraryOptions = {
  sessionPractitioner?: PractitionerSession | null;
};

export async function handleExerciseLibraryRequest(
  request: Request,
  deps: AppDependencies,
  options: HandleExerciseLibraryOptions = {},
): Promise<Response | null> {
  const sessionPractitioner = options.sessionPractitioner;
  const url = new URL(request.url);
  const path = url.pathname;

  const approvedSearchMatch =
    /^\/api\/practitioners\/([^/]+)\/exercises\/approved\/search$/.exec(path);
  if (approvedSearchMatch && request.method === "GET") {
    const pathPractitionerId = approvedSearchMatch[1];
    const practitionerId = bindPathPractitioner(
      pathPractitionerId,
      sessionPractitioner,
    );
    if (practitionerId instanceof Response) {
      return practitionerId;
    }
    const categoryRaw = url.searchParams.get("category");
    const category = categoryRaw ? parseExerciseCategoryLabel(categoryRaw) : undefined;
    if (categoryRaw && !category) {
      return Response.json(
        { error: "invalid_input", message: "Invalid category" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const sortParam = url.searchParams.get("sort");
    const sort =
      sortParam === null ? ("most_used" as ExerciseSearchSort) : parseSort(sortParam);
    if (sort === null) {
      return Response.json(
        { error: "invalid_input", message: "Invalid sort" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const prescriptionTypeRaw = url.searchParams.get("prescription_type");
    if (prescriptionTypeRaw && !parsePrescriptionType(prescriptionTypeRaw)) {
      return Response.json(
        { error: "invalid_input", message: "Invalid prescription_type" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const result = await service(deps).searchApprovedExercises({
        practitionerId,
        query: url.searchParams.get("q") ?? undefined,
        category: category ?? undefined,
        bodyRegion: url.searchParams.get("body_region") ?? undefined,
        prescriptionType: parsePrescriptionType(prescriptionTypeRaw),
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

  const detailsMatch = /^\/api\/practitioners\/([^/]+)\/exercises\/([^/]+)$/.exec(path);
  if (detailsMatch && request.method === "GET") {
    const [, pathPractitionerId, exerciseId] = detailsMatch;
    const practitionerId = bindPathPractitioner(
      pathPractitionerId,
      sessionPractitioner,
    );
    if (practitionerId instanceof Response) {
      return practitionerId;
    }
    try {
      const result = await service(deps).getExerciseDetails(practitionerId, exerciseId);
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const myListMatch = /^\/api\/practitioners\/([^/]+)\/my-exercises$/.exec(path);
  if (myListMatch && request.method === "GET") {
    const pathPractitionerId = myListMatch[1];
    const practitionerId = bindPathPractitioner(
      pathPractitionerId,
      sessionPractitioner,
    );
    if (practitionerId instanceof Response) {
      return practitionerId;
    }
    const categoryRaw = url.searchParams.get("category");
    const category = categoryRaw ? parseExerciseCategoryLabel(categoryRaw) : undefined;
    if (categoryRaw && !category) {
      return Response.json(
        { error: "invalid_input", message: "Invalid category" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const result = await service(deps).listMyExercises({
        practitionerId,
        query: url.searchParams.get("q") ?? undefined,
        category: category ?? undefined,
        bodyRegion: url.searchParams.get("body_region") ?? undefined,
      });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const myItemMatch = /^\/api\/practitioners\/([^/]+)\/my-exercises\/([^/]+)$/.exec(
    path,
  );
  if (myItemMatch) {
    const [, pathPractitionerId, exerciseId] = myItemMatch;
    const practitionerId = bindPathPractitioner(
      pathPractitionerId,
      sessionPractitioner,
    );
    if (practitionerId instanceof Response) {
      return practitionerId;
    }
    if (request.method === "DELETE") {
      try {
        const result = await service(deps).removeFromMyExercises(
          practitionerId,
          exerciseId,
        );
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (request.method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return Response.json(
          { error: "invalid_input", message: "Invalid JSON body" },
          { status: 400, headers: JSON_HEADERS },
        );
      }
      const action = body.action;
      if (action === "save") {
        try {
          const result = await service(deps).saveToMyExercises(
            practitionerId,
            exerciseId,
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
      if (action === "pin") {
        if (typeof body.pinned !== "boolean") {
          return Response.json(
            { error: "invalid_input", message: "pinned must be a boolean" },
            { status: 400, headers: JSON_HEADERS },
          );
        }
        try {
          const result = await service(deps).setPinned(
            practitionerId,
            exerciseId,
            body.pinned,
          );
          return Response.json(result, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
      if (action === "undo") {
        try {
          const undoPayload = parseExerciseMutationUndo(body.undo);
          await service(deps).applyUndo(practitionerId, exerciseId, undoPayload);
          return Response.json({ ok: true }, { headers: JSON_HEADERS });
        } catch (error) {
          return errorResponse(error);
        }
      }
    }
    if (request.method === "PATCH") {
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return Response.json(
          { error: "invalid_input", message: "Invalid JSON body" },
          { status: 400, headers: JSON_HEADERS },
        );
      }
      const useLibraryVersion = Array.isArray(body.use_library_version)
        ? body.use_library_version.filter((key): key is TextOverrideKey =>
            TEXT_OVERRIDE_KEYS.includes(key as TextOverrideKey),
          )
        : undefined;
      const keepMine = Array.isArray(body.keep_mine)
        ? body.keep_mine.filter((key): key is TextOverrideKey =>
            TEXT_OVERRIDE_KEYS.includes(key as TextOverrideKey),
          )
        : undefined;
      let textOverrides: Partial<Record<TextOverrideKey, string>> | undefined;
      if (body.text_overrides !== undefined) {
        try {
          textOverrides = parseTextOverridePatch(body.text_overrides);
        } catch (error) {
          return errorResponse(error);
        }
      }
      try {
        const result = await service(deps).updateMyCopy({
          practitionerId,
          exerciseId,
          textOverrides,
          paramOverrides:
            body.param_overrides && typeof body.param_overrides === "object"
              ? (body.param_overrides as Record<string, unknown>)
              : undefined,
          useLibraryVersion,
          keepMine,
        });
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }
  }

  return null;
}
