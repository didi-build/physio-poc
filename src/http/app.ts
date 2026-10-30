import { handleFakeGoogleRequest } from "../auth/fake-google-http.js";
import { requiresPractitionerSession } from "../auth/public-routes.js";
import { signInPathWithReturnTo } from "../auth/return-to.js";
import type { AuthPort } from "../auth/auth-port.js";
import type { ImageGenerationPort } from "../storage/ports/image-generation.js";
import type { ObjectStoragePort } from "../storage/ports/object-storage.js";
import type { SqlStoragePort } from "../storage/ports/sql-storage.js";
import type { PhysioServerConfig } from "./config.js";
import { handleOptionsPreflight } from "./cors-preflight.js";
import { jsonUnauthorized, redirectResponse } from "./responses.js";
import { handleExerciseLibraryRequest } from "./routes/exercise-library.js";
import { handleHealthRequest } from "./routes/health.js";
import { noopUiStaticPort, type UiStaticPort } from "./ui-static-port.js";

export type McpHttpHandler = (request: Request) => Promise<Response>;

export type McpBearerAuthHandler = (
  request: Request,
  mcpHandler: McpHttpHandler,
) => Promise<Response>;

export type GuardedAppWithoutSession = "redirect" | "service-unavailable";

/** Returns a Response when the handler owns the request; null to try the next handler. */
export type AppRouteHandler = (
  request: Request,
  deps: AppDependencies,
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
  /** Dev/test entries only; never true on the Worker entry. */
  enableFakeGoogleRoutes?: boolean;
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
    fakeGoogleRoutesEnabled: deps.enableFakeGoogleRoutes === true,
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

  if (deps.enableFakeGoogleRoutes) {
    const fakeGoogle = await handleFakeGoogleRequest(request);
    if (fakeGoogle) {
      return fakeGoogle;
    }
  }

  const authResponse = await deps.auth.handleAuthRequest(request);
  if (authResponse) {
    return authResponse;
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
      const sessionPractitioner = await deps.auth.getPractitioner(request);
      const exerciseResponse = await handleExerciseLibraryRequest(request, deps, {
        sessionPractitioner,
      });
      if (exerciseResponse) {
        return exerciseResponse;
      }
      if (deps.extraRouteHandlers) {
        for (const handler of deps.extraRouteHandlers) {
          const response = await handler(request, deps);
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
      const response = await handler(request, deps);
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
  sessionGuardOptions: { fakeGoogleRoutesEnabled: boolean },
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
