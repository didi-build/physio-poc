import type { AppDependencies } from "../app.js";
import { parseExerciseCategoryLabel } from "../../domain/exercise-category-labels.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import {
  TextOverrideLegacyShapeError,
  TextOverrideValidationError,
  validateTextOverrides,
  TEXT_OVERRIDE_KEYS,
  type TextOverrideKey,
} from "../../domain/exercise-text-overrides.js";
import {
  ExerciseLibraryService,
  ExerciseLibraryServiceError,
  type ExerciseSearchSort,
} from "../../services/exercise-library/index.js";

const JSON_HEADERS = { "content-type": "application/json" };

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

export async function handleExerciseLibraryRequest(
  request: Request,
  deps: AppDependencies,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  const approvedSearchMatch =
    /^\/api\/practitioners\/([^/]+)\/exercises\/approved\/search$/.exec(path);
  if (approvedSearchMatch && request.method === "GET") {
    const practitionerId = approvedSearchMatch[1];
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
    const [, practitionerId, exerciseId] = detailsMatch;
    try {
      const result = await service(deps).getExerciseDetails(practitionerId, exerciseId);
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const myListMatch = /^\/api\/practitioners\/([^/]+)\/my-exercises$/.exec(path);
  if (myListMatch && request.method === "GET") {
    const practitionerId = myListMatch[1];
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
    const [, practitionerId, exerciseId] = myItemMatch;
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
        if (!body.undo || typeof body.undo !== "object") {
          return Response.json(
            { error: "invalid_input", message: "undo snapshot required" },
            { status: 400, headers: JSON_HEADERS },
          );
        }
        try {
          await service(deps).applyUndo(practitionerId, exerciseId, body.undo as never);
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
      let textOverrides: ReturnType<typeof validateTextOverrides> | undefined;
      if (body.text_overrides !== undefined) {
        try {
          if (
            typeof body.text_overrides !== "object" ||
            body.text_overrides === null ||
            Array.isArray(body.text_overrides)
          ) {
            throw new TextOverrideValidationError(
              "Text overrides must be a JSON object",
            );
          }
          textOverrides = validateTextOverrides(body.text_overrides);
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
