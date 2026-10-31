import type { AppDependencies } from "../app.js";
import type { PractitionerSession } from "../../auth/auth-port.js";
import { FreeTextValidationError } from "../../domain/exercise-free-text.js";
import { OpaqueEntityIdValidationError } from "../../domain/opaque-entity-id.js";
import {
  exerciseRequestsCollectionPath,
  exerciseRequestsInProgressCountPath,
  exerciseRequestsInProgressPath,
  EXERCISE_REQUESTS_API_BASE,
} from "../../exercise-requests-api-paths.js";
import {
  ExerciseRequestsService,
  ExerciseRequestsServiceError,
  type DraftFieldPatch,
  type SubmitResolution,
} from "../../services/exercise-requests/index.js";
import { rejectBodyPractitionerId } from "../reject-body-practitioner-id.js";
import { requirePractitioner } from "../require-practitioner.js";

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
  if (error instanceof OpaqueEntityIdValidationError) {
    return Response.json(
      { error: "invalid_input", message: error.message },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  if (error instanceof ExerciseRequestsServiceError) {
    const status =
      error.code === "practitioner_not_found" || error.code === "request_not_found"
        ? 404
        : error.code === "conflict_target_not_found" ||
            error.code === "draft_not_ready" ||
            error.code === "merge_target_not_ready"
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

async function readJsonObjectBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return Response.json(
      { error: "invalid_input", message: "Invalid JSON body" },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  if (text.trim() === "") {
    return {};
  }
  try {
    const body = JSON.parse(text) as unknown;
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

type HandleExerciseRequestsOptions = {
  sessionPractitioner?: PractitionerSession | null;
};

export async function handleExerciseRequestsHttpRequest(
  request: Request,
  deps: AppDependencies,
  options: HandleExerciseRequestsOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (
    !path.startsWith(`${EXERCISE_REQUESTS_API_BASE}/`) &&
    path !== EXERCISE_REQUESTS_API_BASE
  ) {
    return null;
  }

  const practitionerOrResponse = requirePractitioner(options.sessionPractitioner);
  if (practitionerOrResponse instanceof Response) {
    return practitionerOrResponse;
  }
  const practitionerId = practitionerOrResponse;

  if (path === `${EXERCISE_REQUESTS_API_BASE}/similar` && request.method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    try {
      const result = await service(deps).listSimilar({ practitionerId, query: q });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (path === exerciseRequestsInProgressCountPath() && request.method === "GET") {
    try {
      const count = await service(deps).getInProgressCount({ practitionerId });
      return Response.json({ in_progress_count: count }, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (path === exerciseRequestsInProgressPath() && request.method === "GET") {
    try {
      const result = await service(deps).listInProgress({ practitionerId });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (path === exerciseRequestsCollectionPath() && request.method === "POST") {
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const bodyRejected = rejectBodyPractitionerId(body);
    if (bodyRejected) {
      return bodyRejected;
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

  const itemMatch = new RegExp(
    `^${EXERCISE_REQUESTS_API_BASE.replace(/\//g, "\\/")}/([^/]+)$`,
  ).exec(path);
  if (itemMatch && request.method === "GET") {
    const requestId = decodeURIComponent(itemMatch[1]!);
    try {
      const result = await service(deps).getRequest({ practitionerId, requestId });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const draftMatch = new RegExp(
    `^${EXERCISE_REQUESTS_API_BASE.replace(/\//g, "\\/")}/([^/]+)/draft$`,
  ).exec(path);
  if (draftMatch && request.method === "PATCH") {
    const requestId = decodeURIComponent(draftMatch[1]!);
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const bodyRejected = rejectBodyPractitionerId(body);
    if (bodyRejected) {
      return bodyRejected;
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

  const approveMatch = new RegExp(
    `^${EXERCISE_REQUESTS_API_BASE.replace(/\//g, "\\/")}/([^/]+)/approve$`,
  ).exec(path);
  if (approveMatch && request.method === "POST") {
    const requestId = decodeURIComponent(approveMatch[1]!);
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const bodyRejected = rejectBodyPractitionerId(body);
    if (bodyRejected) {
      return bodyRejected;
    }
    try {
      const result = await service(deps).approveRequest({ practitionerId, requestId });
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (path.startsWith(EXERCISE_REQUESTS_API_BASE)) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: JSON_HEADERS },
    );
  }

  return null;
}
