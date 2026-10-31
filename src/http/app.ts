import { isAuthAppApiPath } from "../auth/auth-app-api-prefix.js";
import { requiresPractitionerSession } from "../auth/public-routes.js";
import { signInPathWithReturnTo } from "../auth/return-to.js";
import type { AuthPort, PractitionerSession } from "../auth/auth-port.js";
import type { ImageGenerationPort } from "../storage/ports/image-generation.js";
import type { ObjectStoragePort } from "../storage/ports/object-storage.js";
import type { SqlStoragePort } from "../storage/ports/sql-storage.js";
import type { PhysioServerConfig } from "./config.js";
import { handleOptionsPreflight } from "./cors-preflight.js";
import {
  rejectMutatingAppApiCsrf,
  requiresAppApiCsrfGuard,
} from "./mutating-app-api-csrf.js";
import { jsonUnauthorized, redirectResponse } from "./responses.js";
import { handleExerciseLibraryRequest } from "./routes/exercise-library.js";
import { handleExerciseRequestsHttpRequest } from "./routes/exercise-requests.js";
import { handleMyDefaultsRequest } from "./routes/my-defaults.js";
import { handleProgramBuilderRequest } from "./routes/program-builder.js";
import { handleRoutinesRequest } from "./routes/routines.js";
import { rejectQueryPractitionerId } from "./reject-query-practitioner-id.js";
import { handleHealthRequest } from "./routes/health.js";
import { noopUiStaticPort, type UiStaticPort } from "./ui-static-port.js";

export type McpHttpHandler = (request: Request) => Promise<Response>;

export type McpBearerAuthHandler = (
  request: Request,
  mcpHandler: McpHttpHandler,
) => Promise<Response>;

export type FakeGooglePreAuthHandler = (
  request: Request,
  authBaseUrl: string,
) => Promise<Response | null>;

export type GuardedAppWithoutSession = "redirect" | "service-unavailable";

export type AppRouteHandlerContext = {
  sessionPractitioner?: PractitionerSession | null;
};

/** Returns a Response when the handler owns the request; null to try the next handler. */
export type AppRouteHandler = (
  request: Request,
  deps: AppDependencies,
  context?: AppRouteHandlerContext,
) => Promise<Response | null>;

export type AppDependencies = {
  sql: SqlStoragePort;
  objects: ObjectStoragePort;
  config: PhysioServerConfig;
  auth: AuthPort;
  mcp: McpHttpHandler;
  /** When set, /mcp requires a valid OAuth bearer token (DIDI-1043). */
  mcpBearerAuth?: McpBearerAuthHandler;
  uiStatic?: UiStaticPort;
  /** Dev/test Node entry only; never set on the Worker entry. */
  fakeGooglePreAuth?: FakeGooglePreAuthHandler;
  /** Dev/test only; session guard public paths (for example fake Google OAuth). */
  extraSessionPublicPath?: (pathname: string) => boolean;
  guardedAppWithoutSession?: GuardedAppWithoutSession;
  /** Entry-specific routes (for example exercise media on Node dev/test only). Never set on the Worker entry. */
  extraRouteHandlers?: AppRouteHandler[];
  /** Optional image port for exercise media routes (tests only). */
  exerciseMediaImages?: ImageGenerationPort;
};

export const MCP_PATH = "/mcp";

const JSON_HEADERS = { "content-type": "application/json" };

export async function handleRequest(
  request: Request,
  deps: AppDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const ui = deps.uiStatic ?? noopUiStaticPort;

  if (request.method === "OPTIONS") {
    return handleOptionsPreflight(request);
  }

  void deps.sql;
  void deps.objects;

  const sessionGuardOptions = {
    extraSessionPublicPath: deps.extraSessionPublicPath,
  };

  if (
    (request.method === "GET" || request.method === "HEAD") &&
    pathname === "/health"
  ) {
    if (request.method === "HEAD") {
      return new Response(null, { status: 200 });
    }
    return handleHealthRequest();
  }

  if (request.method === "POST" && pathname === "/health") {
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers: JSON_HEADERS },
    );
  }

  if (deps.fakeGooglePreAuth) {
    const fakeGoogle = await deps.fakeGooglePreAuth(
      request,
      deps.config.auth.authBaseUrl,
    );
    if (fakeGoogle) {
      return fakeGoogle;
    }
  }

  const authResponse = await deps.auth.handleAuthRequest(request);
  if (authResponse) {
    return authResponse;
  }
  if (isAuthAppApiPath(pathname)) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: JSON_HEADERS },
    );
  }

  if (
    requiresAppApiCsrfGuard(pathname, request.method) &&
    !pathname.startsWith("/api/")
  ) {
    const csrfRejection = rejectMutatingAppApiCsrf(request, deps.config);
    if (csrfRejection) {
      return csrfRejection;
    }
  }

  const asset = ui.tryServeAsset(pathname);
  if (asset) {
    return asset;
  }

  if (pathname === MCP_PATH || pathname === `${MCP_PATH}/`) {
    if (deps.mcpBearerAuth) {
      return deps.mcpBearerAuth(request, deps.mcp);
    }
    const practitioner = await deps.auth.getPractitioner(request);
    if (!practitioner) {
      return jsonUnauthorized();
    }
    return deps.mcp(request);
  }

  if (pathname.startsWith("/api/")) {
    return guardAndRun(request, deps, sessionGuardOptions, async () => {
      if (requiresAppApiCsrfGuard(pathname, request.method)) {
        const csrfRejection = rejectMutatingAppApiCsrf(request, deps.config);
        if (csrfRejection) {
          return csrfRejection;
        }
      }
      if (pathname.startsWith("/api/me/")) {
        const queryRejected = rejectQueryPractitionerId(url);
        if (queryRejected) {
          return queryRejected;
        }
      }
      const sessionPractitioner = await deps.auth.getPractitioner(request);
      const programBuilderResponse = await handleProgramBuilderRequest(request, deps, {
        sessionPractitioner,
      });
      if (programBuilderResponse) {
        return programBuilderResponse;
      }
      const routinesResponse = await handleRoutinesRequest(request, deps, {
        sessionPractitioner,
      });
      if (routinesResponse) {
        return routinesResponse;
      }
      const exerciseResponse = await handleExerciseLibraryRequest(request, deps, {
        sessionPractitioner,
      });
      if (exerciseResponse) {
        return exerciseResponse;
      }
      const myDefaultsResponse = await handleMyDefaultsRequest(request, deps, {
        sessionPractitioner,
      });
      if (myDefaultsResponse) {
        return myDefaultsResponse;
      }
      const exerciseRequestsResponse = await handleExerciseRequestsHttpRequest(
        request,
        deps,
        { sessionPractitioner },
      );
      if (exerciseRequestsResponse) {
        return exerciseRequestsResponse;
      }
      if (deps.extraRouteHandlers) {
        for (const handler of deps.extraRouteHandlers) {
          const response = await handler(request, deps, { sessionPractitioner });
          if (response) {
            return response;
          }
        }
      }
      return Response.json(
        { error: "not_found" },
        { status: 404, headers: JSON_HEADERS },
      );
    });
  }

  if (requiresPractitionerSession(pathname, request.method, sessionGuardOptions)) {
    const practitioner = await deps.auth.getPractitioner(request);
    if (!practitioner) {
      return unauthenticatedAppResponse(request, deps, pathname, url.search);
    }
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const shell = ui.renderAppShell();
    if (shell) {
      return shell;
    }
  }

  if (deps.extraRouteHandlers) {
    for (const handler of deps.extraRouteHandlers) {
      // Non-/api/ fallthrough: no sessionPractitioner (exercise media routes are under /api/ only).
      const response = await handler(request, deps, {});
      if (response) {
        return response;
      }
    }
  }

  return Response.json({ error: "not_found" }, { status: 404, headers: JSON_HEADERS });
}

async function guardAndRun(
  request: Request,
  deps: AppDependencies,
  sessionGuardOptions: { extraSessionPublicPath?: (pathname: string) => boolean },
  next: () => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  if (!requiresPractitionerSession(url.pathname, request.method, sessionGuardOptions)) {
    return next();
  }
  const practitioner = await deps.auth.getPractitioner(request);
  if (!practitioner) {
    if (url.pathname.startsWith("/api/")) {
      return jsonUnauthorized();
    }
    return unauthenticatedAppResponse(request, deps, url.pathname, url.search);
  }
  return next();
}

function unauthenticatedAppResponse(
  request: Request,
  deps: AppDependencies,
  pathname: string,
  search: string,
): Response {
  if (deps.guardedAppWithoutSession === "service-unavailable") {
    return new Response(null, { status: 503 });
  }
  if (request.method === "GET" || request.method === "HEAD") {
    const returnTo = `${pathname}${search}`;
    return redirectResponse(signInPathWithReturnTo(returnTo));
  }
  return jsonUnauthorized();
}
