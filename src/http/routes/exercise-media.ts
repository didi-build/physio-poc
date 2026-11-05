import type { AppDependencies } from "../app.js";
import type { MediaRegenerationScope } from "../../storage/repositories/exercise-media.js";
import { FalImageGenerationError } from "../../storage/ports/image-generation.js";
import {
  ExerciseMediaService,
  ExerciseMediaServiceError,
} from "../../services/exercise-media/index.js";
import { FakeImageGeneration } from "../../storage/adapters/memory/fake-image-generation.js";
import { PrefixMediaStorage } from "../../storage/adapters/memory/prefix-media-storage.js";
import {
  EXERCISE_MEDIA_REGENERATION_QUOTA_PATH,
  exerciseMediaGeneratePath,
  exerciseMediaRegeneratePath,
  exerciseMediaServePath,
} from "../../exercise-media-api-paths.js";
import type { PractitionerSession } from "../../auth/auth-port.js";
import { rejectBodyPractitionerId } from "../reject-body-practitioner-id.js";
import { requirePractitioner } from "../require-practitioner.js";
import { jsonUnauthorized } from "../responses.js";

const JSON_HEADERS = { "content-type": "application/json" };

const SERVE_JSON_HEADERS = {
  ...JSON_HEADERS,
  "cache-control": "no-store",
};

const EXERCISE_MEDIA_ME_VERSION_PATH =
  /^\/api\/me\/exercise-versions\/([^/]+)\/media\/(generate|regenerate)$/;

function serveJson(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: SERVE_JSON_HEADERS });
}

function withServeCacheControl(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

export type ExerciseMediaHttpRouteCase = {
  method: string;
  path: string;
};

/** Paths used by route registry and Worker 404 tests. */
export function exerciseMediaHttpRouteCases(
  exerciseVersionId = "ver-1",
): ExerciseMediaHttpRouteCase[] {
  return [
    {
      method: "POST",
      path: exerciseMediaGeneratePath(exerciseVersionId),
    },
    {
      method: "POST",
      path: exerciseMediaRegeneratePath(exerciseVersionId),
    },
    {
      method: "GET",
      path: EXERCISE_MEDIA_REGENERATION_QUOTA_PATH,
    },
    {
      method: "GET",
      path: `${exerciseMediaServePath(exerciseVersionId)}?access=public`,
    },
    {
      method: "GET",
      path: `${exerciseMediaServePath(exerciseVersionId)}?access=internal`,
    },
  ];
}

function mediaService(deps: AppDependencies): ExerciseMediaService {
  return new ExerciseMediaService(
    deps.sql,
    deps.exerciseMediaImages ?? new FakeImageGeneration(),
    new PrefixMediaStorage(deps.objects),
  );
}

function serviceErrorResponse(error: ExerciseMediaServiceError): Response {
  const status =
    error.code === "version_not_found" || error.code === "media_set_not_found"
      ? 404
      : error.code === "daily_limit_reached"
        ? 429
        : error.code === "start_reference_unavailable"
          ? 409
          : 400;
  return Response.json(
    { error: error.code, message: error.message },
    { status, headers: JSON_HEADERS },
  );
}

function routeErrorResponse(error: unknown): Response | null {
  if (error instanceof ExerciseMediaServiceError) {
    return serviceErrorResponse(error);
  }
  if (error instanceof FalImageGenerationError) {
    return Response.json({ error: error.code }, { status: 502, headers: JSON_HEADERS });
  }
  return null;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim().length === 0) {
    return {};
  }
  return JSON.parse(text) as unknown;
}

async function readJsonObjectBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  try {
    const body = await readJsonBody(request);
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

export async function handleExerciseMediaRequest(
  request: Request,
  deps: AppDependencies,
  options: { sessionPractitioner?: PractitionerSession | null } = {},
): Promise<Response | null> {
  const sessionPractitioner = options.sessionPractitioner;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === EXERCISE_MEDIA_REGENERATION_QUOTA_PATH && request.method === "GET") {
    const practitionerId = requirePractitioner(sessionPractitioner);
    if (practitionerId instanceof Response) {
      return practitionerId;
    }
    try {
      const quota = await mediaService(deps).getRegenerationQuota(practitionerId);
      return Response.json(quota, { headers: JSON_HEADERS });
    } catch (error) {
      const response = routeErrorResponse(error);
      if (response) {
        return response;
      }
      throw error;
    }
  }

  const serveMatch = path.match(/^\/api\/exercise-versions\/([^/]+)\/media$/);
  if (serveMatch && request.method === "GET") {
    const access = url.searchParams.get("access");
    if (access !== "public" && access !== "internal") {
      return serveJson(
        { error: "invalid_input", message: "access must be public or internal" },
        400,
      );
    }
    try {
      if (access === "internal") {
        if (!sessionPractitioner) {
          return withServeCacheControl(jsonUnauthorized());
        }
      }
      const sessionPractitionerId =
        access === "internal" ? sessionPractitioner?.practitionerId : undefined;
      const view = await mediaService(deps).getMediaForServing(
        serveMatch[1] ?? "",
        access,
        sessionPractitionerId,
      );
      if (!view) {
        return serveJson(
          { error: "media_not_found", message: "Media not available" },
          404,
        );
      }
      return serveJson(view, 200);
    } catch (error) {
      const response = routeErrorResponse(error);
      if (response) {
        return withServeCacheControl(response);
      }
      throw error;
    }
  }

  const versionMatch = EXERCISE_MEDIA_ME_VERSION_PATH.exec(path);
  if (!versionMatch) {
    return null;
  }

  const practitionerId = requirePractitioner(sessionPractitioner);
  if (practitionerId instanceof Response) {
    return practitionerId;
  }

  const exerciseVersionId = versionMatch[1] ?? "";
  const action = versionMatch[2];
  const service = mediaService(deps);

  if (action === "generate") {
    if (request.method !== "POST") {
      return Response.json(
        { error: "method_not_allowed" },
        { status: 405, headers: JSON_HEADERS },
      );
    }
    const body = await readJsonObjectBody(request);
    if (body instanceof Response) {
      return body;
    }
    const rejected = rejectBodyPractitionerId(body);
    if (rejected) {
      return rejected;
    }
    try {
      const media = await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId,
        regenerationNote:
          typeof body.note === "string" || body.note === null
            ? (body.note as string | null)
            : undefined,
      });
      return Response.json({ media }, { status: 201, headers: JSON_HEADERS });
    } catch (error) {
      const response = routeErrorResponse(error);
      if (response) {
        return response;
      }
      throw error;
    }
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers: JSON_HEADERS },
    );
  }

  const body = await readJsonObjectBody(request);
  if (body instanceof Response) {
    return body;
  }
  const rejected = rejectBodyPractitionerId(body);
  if (rejected) {
    return rejected;
  }

  const scope = body.scope as MediaRegenerationScope | undefined;
  if (!scope) {
    return Response.json(
      { error: "invalid_input", message: "scope is required" },
      { status: 400, headers: JSON_HEADERS },
    );
  }

  try {
    const result = await service.regenerateMedia({
      practitionerId,
      exerciseVersionId,
      scope,
      note: typeof body.note === "string" || body.note === null ? body.note : undefined,
    });
    return Response.json(result, { headers: JSON_HEADERS });
  } catch (error) {
    const response = routeErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
