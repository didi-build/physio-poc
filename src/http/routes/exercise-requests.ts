import type { AppDependencies } from "../app.js";
import { FreeTextValidationError } from "../../domain/exercise-free-text.js";
import {
  ExerciseRequestsService,
  ExerciseRequestsServiceError,
  type DraftFieldPatch,
  type SubmitResolution,
} from "../../services/exercise-requests/index.js";

const JSON_HEADERS = { "content-type": "application/json" };

const SUBMIT_RESOLUTIONS = new Set<SubmitResolution>([
  "submit",
  "use_existing",
  "merge",
  "submit_anyway",
]);

function service(deps: AppDependencies): ExerciseRequestsService {
  return new ExerciseRequestsService(deps.sql, deps.config);
}

function errorResponse(error: unknown): Response {
  if (error instanceof FreeTextValidationError) {
    return Response.json(
      { error: "invalid_input", message: error.message },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  if (error instanceof ExerciseRequestsServiceError) {
    const status =
      error.code === "practitioner_not_found" || error.code === "request_not_found"
        ? 404
        : error.code === "conflict_target_not_found" || error.code === "draft_not_ready"
          ? 404
          : error.code === "approve_failed"
            ? 409
            : 400;
    return Response.json(
      { error: error.code, message: error.message },
      { status, headers: JSON_HEADERS },
    );
  }
  throw error;
}

export async function handleExerciseRequestsHttpRequest(
  request: Request,
  deps: AppDependencies,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  const similarMatch =
    /^\/api\/practitioners\/([^/]+)\/exercise-requests\/similar$/.exec(path);
  if (similarMatch && request.method === "GET") {
    const practitionerId = similarMatch[1];
    const q = url.searchParams.get("q") ?? "";
    try {
      const result = await service(deps).listSimilar({ practitionerId, query: q });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const countMatch =
    /^\/api\/practitioners\/([^/]+)\/exercise-requests\/in-progress\/count$/.exec(path);
  if (countMatch && request.method === "GET") {
    const practitionerId = countMatch[1];
    try {
      const count = await service(deps).getInProgressCount({ practitionerId });
      return Response.json({ in_progress_count: count }, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const listMatch =
    /^\/api\/practitioners\/([^/]+)\/exercise-requests\/in-progress$/.exec(path);
  if (listMatch && request.method === "GET") {
    const practitionerId = listMatch[1];
    try {
      const result = await service(deps).listInProgress({ practitionerId });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const collectionMatch = /^\/api\/practitioners\/([^/]+)\/exercise-requests$/.exec(
    path,
  );
  if (collectionMatch && request.method === "POST") {
    const practitionerId = collectionMatch[1];
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json(
        { error: "invalid_input", message: "Invalid JSON body" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    if (typeof body.requested_name !== "string") {
      return Response.json(
        { error: "invalid_input", message: "requested_name is required" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    if (typeof body.form_opened_at !== "string") {
      return Response.json(
        { error: "invalid_input", message: "form_opened_at is required" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const resolutionRaw = body.resolution;
    const resolution =
      resolutionRaw === undefined
        ? undefined
        : SUBMIT_RESOLUTIONS.has(resolutionRaw as SubmitResolution)
          ? (resolutionRaw as SubmitResolution)
          : null;
    if (resolution === null) {
      return Response.json(
        { error: "invalid_input", message: "Invalid resolution" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const result = await service(deps).submitRequest({
        practitionerId,
        requestedName: body.requested_name,
        exerciseNote:
          body.exercise_note === undefined
            ? undefined
            : (body.exercise_note as string | null),
        formOpenedAt: body.form_opened_at,
        resolution,
        conflictRequestId:
          typeof body.conflict_request_id === "string"
            ? body.conflict_request_id
            : undefined,
      });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const itemMatch = /^\/api\/practitioners\/([^/]+)\/exercise-requests\/([^/]+)$/.exec(
    path,
  );
  if (itemMatch) {
    const [, practitionerId, requestId] = itemMatch;
    if (request.method === "GET") {
      try {
        const result = await service(deps).getRequest({ practitionerId, requestId });
        return Response.json(result, { headers: JSON_HEADERS });
      } catch (error) {
        return errorResponse(error);
      }
    }
  }

  const draftMatch =
    /^\/api\/practitioners\/([^/]+)\/exercise-requests\/([^/]+)\/draft$/.exec(path);
  if (draftMatch && request.method === "PATCH") {
    const [, practitionerId, requestId] = draftMatch;
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json(
        { error: "invalid_input", message: "Invalid JSON body" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const result = await service(deps).updateDraft({
        practitionerId,
        requestId,
        patch: body as DraftFieldPatch,
      });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const approveMatch =
    /^\/api\/practitioners\/([^/]+)\/exercise-requests\/([^/]+)\/approve$/.exec(path);
  if (approveMatch && request.method === "POST") {
    const [, practitionerId, requestId] = approveMatch;
    try {
      const result = await service(deps).approveRequest({ practitionerId, requestId });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  return null;
}
