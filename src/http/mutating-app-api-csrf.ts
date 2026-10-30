import type { PhysioServerConfig } from "./config.js";
import { jsonForbidden } from "./responses.js";

/** Only `/api/auth/**` is exempt from app API CSRF (exact prefix; `/api/authx` is not exempt). */
export const CSRF_EXEMPT_APP_API_AUTH_PREFIX = "/api/auth";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isNonSafeHttpMethod(method: string): boolean {
  return !SAFE_HTTP_METHODS.has(method.toUpperCase());
}

/** @deprecated Use `requiresAppApiCsrfGuard`; kept for tests naming mutating paths. */
export function isMutatingHttpMethod(method: string): boolean {
  return isNonSafeHttpMethod(method);
}

export function isCsrfExemptAppApiAuthPath(pathname: string): boolean {
  return (
    pathname === CSRF_EXEMPT_APP_API_AUTH_PREFIX ||
    pathname.startsWith(`${CSRF_EXEMPT_APP_API_AUTH_PREFIX}/`)
  );
}

export function requiresAppApiCsrfGuard(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/api/")) {
    return false;
  }
  if (!isNonSafeHttpMethod(method)) {
    return false;
  }
  return !isCsrfExemptAppApiAuthPath(pathname);
}

/** True when `rejectMutatingAppApiCsrf` may run for this path and method. */
export function isMutatingAppApiPath(pathname: string, method: string): boolean {
  return requiresAppApiCsrfGuard(pathname, method);
}

export function allowedMutatingAppApiOrigins(
  request: Request,
  config: PhysioServerConfig,
): ReadonlySet<string> {
  const origins = new Set<string>();
  origins.add(new URL(request.url).origin);
  origins.add(new URL(config.webAppBaseUrl).origin);
  origins.add(new URL(config.auth.authBaseUrl).origin);
  return origins;
}

function parseHeaderOrigin(value: string): string | null {
  if (value === "null") {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function requestSourceOrigin(request: Request): string | null {
  const originHeader = request.headers.get("Origin");
  if (originHeader) {
    return parseHeaderOrigin(originHeader);
  }
  const referer = request.headers.get("Referer");
  if (referer) {
    return parseHeaderOrigin(referer);
  }
  return null;
}

export function isApplicationJsonContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json";
}

export function rejectMutatingAppApiCsrf(
  request: Request,
  config: PhysioServerConfig,
): Response | null {
  const url = new URL(request.url);
  if (!requiresAppApiCsrfGuard(url.pathname, request.method)) {
    return null;
  }
  if (!isApplicationJsonContentType(request.headers.get("Content-Type"))) {
    return new Response(null, { status: 415 });
  }
  const sourceOrigin = requestSourceOrigin(request);
  if (!sourceOrigin) {
    return jsonForbidden();
  }
  if (!allowedMutatingAppApiOrigins(request, config).has(sourceOrigin)) {
    return jsonForbidden();
  }
  return null;
}
