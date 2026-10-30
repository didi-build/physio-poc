import { isAuthAppApiPath } from "../auth/auth-app-api-prefix.js";
import type { PhysioServerConfig } from "./config.js";
import { jsonForbidden } from "./responses.js";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const APP_API_CSRF_SCOPE_PREFIX = "/api/";

function pathnameMatchesAppApiCsrfScope(pathname: string): boolean {
  if (pathname.length < APP_API_CSRF_SCOPE_PREFIX.length) {
    return false;
  }
  return (
    pathname.slice(0, APP_API_CSRF_SCOPE_PREFIX.length).toLowerCase() ===
    APP_API_CSRF_SCOPE_PREFIX
  );
}

export function isNonSafeHttpMethod(method: string): boolean {
  return !SAFE_HTTP_METHODS.has(method.toUpperCase());
}

export function isCsrfExemptAppApiAuthPath(pathname: string): boolean {
  return isAuthAppApiPath(pathname);
}

export function requiresAppApiCsrfGuard(pathname: string, method: string): boolean {
  if (!isNonSafeHttpMethod(method)) {
    return false;
  }
  if (!pathnameMatchesAppApiCsrfScope(pathname)) {
    return false;
  }
  return !isCsrfExemptAppApiAuthPath(pathname);
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
