import type { AppDependencies } from "../app.js";
import type { MediaRegenerationScope } from "../../storage/repositories/exercise-media.js";
import { FalImageGenerationError } from "../../storage/ports/image-generation.js";
import {
  ExerciseMediaService,
  ExerciseMediaServiceError,
} from "../../services/exercise-media/index.js";
import { FakeImageGeneration } from "../../storage/adapters/memory/fake-image-generation.js";
import { PrefixMediaStorage } from "../../storage/adapters/memory/prefix-media-storage.js";
import { resolveExerciseRoutePractitionerId } from "../bind-route-practitioner.js";
import type { PractitionerSession } from "../../auth/auth-port.js";
import { jsonUnauthorized } from "../responses.js";

const JSON_HEADERS = { "content-type": "application/json" };

const SERVE_JSON_HEADERS = {
  ...JSON_HEADERS,
  "cache-control": "no-store",
};

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

/** Paths used by Worker 404 tests; registered only via Node dev/test extraRouteHandlers. */
export function exerciseMediaHttpRouteCases(
  practitionerId = "pract-1",
  exerciseVersionId = "ver-1",
): ExerciseMediaHttpRouteCase[] {
  const base = `/api/practitioners/${practitionerId}`;
  return [
    {
      method: "POST",
      path: `${base}/exercise-versions/${exerciseVersionId}/media/generate`,
    },
    {
      method: "POST",
      path: `${base}/exercise-versions/${exerciseVersionId}/media/regenerate`,
    },
    {
      method: "GET",
      path: `${base}/media-regeneration-quota`,
    },
    {
      method: "GET",
      path: `/api/exercise-versions/${exerciseVersionId}/media?access=public`,
    },
    {
      method: "GET",
      path: `/api/exercise-versions/${exerciseVersionId}/media?access=internal`,
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

export async function handleExerciseMediaRequest(
  request: Request,
  deps: AppDependencies,
  options: { sessionPractitioner?: PractitionerSession | null } = {},
): Promise<Response | null> {
  const sessionPractitioner = options.sessionPractitioner;
  const url = new URL(request.url);
  const path = url.pathname;

  function bindPathPractitioner(pathPractitionerId: string): string | Response {
    return resolveExerciseRoutePractitionerId(pathPractitionerId, sessionPractitioner);
  }

  const quotaMatch = path.match(
    /^\/api\/practitioners\/([^/]+)\/media-regeneration-quota$/,
  );
  if (quotaMatch && request.method === "GET") {
    const pathPractitionerId = quotaMatch[1] ?? "";
    const practitionerId = bindPathPractitioner(pathPractitionerId);
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

  const versionMatch = path.match(
    /^\/api\/practitioners\/([^/]+)\/exercise-versions\/([^/]+)\/media\/(generate|regenerate)$/,
  );
  if (!versionMatch) {
    return null;
  }

  const pathPractitionerId = versionMatch[1] ?? "";
  const boundPractitionerId = bindPathPractitioner(pathPractitionerId);
  if (boundPractitionerId instanceof Response) {
    return boundPractitionerId;
  }
  const practitionerId = boundPractitionerId;
  const exerciseVersionId = versionMatch[2] ?? "";
  const action = versionMatch[3];
  const service = mediaService(deps);

  if (action === "generate") {
    if (request.method !== "POST") {
      return Response.json(
        { error: "method_not_allowed" },
        { status: 405, headers: JSON_HEADERS },
      );
    }
    let body: { note?: string | null } = {};
    try {
      body = (await readJsonBody(request)) as { note?: string | null };
    } catch {
      return Response.json(
        { error: "invalid_input", message: "Invalid JSON body" },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    try {
      const media = await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId,
        regenerationNote: body.note,
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

  let body: { scope?: string; note?: string | null } = {};
  try {
    body = (await readJsonBody(request)) as { scope?: string; note?: string | null };
  } catch {
    return Response.json(
      { error: "invalid_input", message: "Invalid JSON body" },
      { status: 400, headers: JSON_HEADERS },
    );
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
      note: body.note,
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
