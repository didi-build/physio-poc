import type { AppDependencies } from "../app.js";
import { parseExerciseCategoryLabel } from "../../domain/exercise-category-labels.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import {
  ExerciseLibraryService,
  ExerciseLibraryServiceError,
  type ExerciseSearchSort,
} from "../../services/exercise-library/index.js";
import type { TextOverrideKey } from "../../domain/exercise-text-overrides.js";
import { TEXT_OVERRIDE_KEYS } from "../../domain/exercise-text-overrides.js";

const JSON_HEADERS = { "content-type": "application/json" };

function service(deps: AppDependencies): ExerciseLibraryService {
  return new ExerciseLibraryService(deps.sql, deps.config);
}

function errorResponse(error: unknown): Response {
  if (error instanceof ExerciseLibraryServiceError) {
    const status =
      error.code === "practitioner_not_found" || error.code === "exercise_not_found"
        ? 404
        : error.code === "my_exercise_not_found"
          ? 404
          : error.code === "invalid_input"
            ? 400
            : 400;
    return Response.json(
      { error: error.code, message: error.message },
      { status, headers: JSON_HEADERS },
    );
  }
  throw error;
}

function parseSort(raw: string | null): ExerciseSearchSort {
  if (raw === "newest" || raw === "a_to_z" || raw === "most_used") {
    return raw;
  }
  return "most_used";
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
    try {
      const result = await service(deps).searchApprovedExercises({
        practitionerId,
        query: url.searchParams.get("q") ?? undefined,
        category: category ?? undefined,
        bodyRegion: url.searchParams.get("body_region") ?? undefined,
        prescriptionType: parsePrescriptionType(
          url.searchParams.get("prescription_type"),
        ),
        sort: parseSort(url.searchParams.get("sort")),
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
    try {
      const result = await service(deps).listMyExercises(myListMatch[1]);
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
        const savedAt =
          typeof body.saved_at === "string" ? body.saved_at : new Date().toISOString();
        try {
          const result = await service(deps).saveToMyExercises(
            practitionerId,
            exerciseId,
            savedAt,
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
          await service(deps).applyUndo(body.undo as never);
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
      try {
        const result = await service(deps).updateMyCopy({
          practitionerId,
          exerciseId,
          textOverrides:
            body.text_overrides && typeof body.text_overrides === "object"
              ? (body.text_overrides as Record<string, string>)
              : undefined,
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
