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
import { ExerciseMediaService } from "../../services/exercise-media/index.js";
import { FakeImageGeneration } from "../../storage/adapters/memory/fake-image-generation.js";
import { PrefixMediaStorage } from "../../storage/adapters/memory/prefix-media-storage.js";
import {
  ExerciseRequestsService,
  ExerciseRequestsServiceError,
  type DraftFieldPatch,
  type SubmitResolution,
} from "../../services/exercise-requests/index.js";
import { DeepInfraExerciseDraftError } from "../../services/exercise-requests/deepinfra-exercise-draft-error.js";
import type { DraftGenerationWorkflowPort } from "../../services/exercise-requests/draft-generation-workflow-types.js";
import { rejectBodyPractitionerId } from "../reject-body-practitioner-id.js";
import { requirePractitioner } from "../require-practitioner.js";

const JSON_HEADERS = { "content-type": "application/json" };

const SUBMIT_RESOLUTIONS = new Set<SubmitResolution>([
  "submit",
  "use_existing",
  "merge",
  "submit_anyway",
]);

function mediaService(deps: AppDependencies): ExerciseMediaService {
  return new ExerciseMediaService(
    deps.sql,
    deps.exerciseMediaImages ?? new FakeImageGeneration(),
    new PrefixMediaStorage(deps.objects),
  );
}

function service(deps: AppDependencies): ExerciseRequestsService {
  const media = mediaService(deps);
  return new ExerciseRequestsService(deps.sql, deps.config, {
    draftGenerator: deps.exerciseDraftGenerator,
    initialDraftMediaProgress: (versionId) =>
      media.getInitialDraftMediaProgress(versionId),
  });
}

function resolveDraftGenerationWorkflow(
  deps: AppDependencies,
): DraftGenerationWorkflowPort {
  if (!deps.draftGenerationWorkflow) {
    throw new ExerciseRequestsServiceError(
      "Draft generation workflow is not configured",
      "draft_generation_workflow_unavailable",
    );
  }
  return deps.draftGenerationWorkflow;
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
  if (error instanceof DeepInfraExerciseDraftError) {
    return Response.json({ error: error.code }, { status: 502, headers: JSON_HEADERS });
  }
  if (error instanceof ExerciseRequestsServiceError) {
    const status =
      error.code === "practitioner_not_found" || error.code === "request_not_found"
        ? 404
        : error.code === "conflict_target_not_found" ||
            error.code === "draft_not_ready" ||
            error.code === "merge_target_not_ready"
          ? 404
          : error.code === "generation_not_requester"
            ? 403
            : error.code === "draft_generation_workflow_unavailable"
              ? 503
              : error.code === "draft_generation_workflow_start_failed"
                ? 502
                : error.code === "approve_failed" ||
                    error.code === "alias_conflict" ||
                    error.code === "request_already_approved" ||
                    error.code === "submit_failed" ||
                    error.code === "draft_generation_in_progress" ||
                    error.code === "request_not_deletable"
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

  const regenTextMatch = new RegExp(
    `^${EXERCISE_REQUESTS_API_BASE.replace(/\//g, "\\/")}/([^/]+)/regenerate-text$`,
  ).exec(path);
  if (regenTextMatch && request.method === "POST") {
    const requestId = decodeURIComponent(regenTextMatch[1]!);
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const bodyRejected = rejectBodyPractitionerId(body);
    if (bodyRejected) {
      return bodyRejected;
    }
    try {
      const result = await service(deps).regenerateDraftText({
        practitionerId,
        requestId,
        note:
          typeof body.note === "string" || body.note === null
            ? (body.note as string | null)
            : undefined,
      });
      if (result.outcome === "complete") {
        return Response.json(result, { headers: JSON_HEADERS });
      }
      if (result.outcome === "in_progress") {
        return Response.json(result, { status: 202, headers: JSON_HEADERS });
      }
      if (result.outcome === "text_failed") {
        return Response.json(result, { status: 502, headers: JSON_HEADERS });
      }
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const generateMatch = new RegExp(
    `^${EXERCISE_REQUESTS_API_BASE.replace(/\//g, "\\/")}/([^/]+)/generate$`,
  ).exec(path);
  if (generateMatch && request.method === "POST") {
    const requestId = decodeURIComponent(generateMatch[1]!);
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const bodyRejected = rejectBodyPractitionerId(body);
    if (bodyRejected) {
      return bodyRejected;
    }
    const mediaService = new ExerciseMediaService(
      deps.sql,
      deps.exerciseMediaImages ?? new FakeImageGeneration(),
      new PrefixMediaStorage(deps.objects),
    );
    try {
      const requestService = service(deps);
      const workflow = resolveDraftGenerationWorkflow(deps);
      const result = await requestService.generateRequest({
        practitionerId,
        requestId,
        mediaService,
        workflow,
      });
      if (result.outcome === "complete") {
        return Response.json(result, { headers: JSON_HEADERS });
      }
      if (result.outcome === "in_progress") {
        return Response.json(result, { status: 202, headers: JSON_HEADERS });
      }
      if (result.outcome === "text_failed") {
        return Response.json(result, { status: 502, headers: JSON_HEADERS });
      }
      if (result.outcome === "images_failed") {
        return Response.json(result, { status: 502, headers: JSON_HEADERS });
      }
      if (result.outcome === "daily_limit") {
        return Response.json(result, { status: 429, headers: JSON_HEADERS });
      }
      return Response.json(result, { headers: JSON_HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const withdrawMatch = new RegExp(
    `^${EXERCISE_REQUESTS_API_BASE.replace(/\//g, "\\/")}/([^/]+)/withdraw$`,
  ).exec(path);
  if (withdrawMatch && request.method === "POST") {
    const requestId = decodeURIComponent(withdrawMatch[1]!);
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const bodyRejected = rejectBodyPractitionerId(body);
    if (bodyRejected) {
      return bodyRejected;
    }
    try {
      const result = await service(deps).withdrawRequest({
        practitionerId,
        requestId,
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
