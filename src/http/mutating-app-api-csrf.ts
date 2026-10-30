import { isPublicApiAuthPath } from "../auth/public-routes.js";
import type { PhysioServerConfig } from "./config.js";
import { jsonForbidden } from "./responses.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutatingHttpMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

export function isMutatingAppApiPath(pathname: string, method: string): boolean {
  if (!isMutatingHttpMethod(method)) {
    return false;
  }
  if (!pathname.startsWith("/api/")) {
    return false;
  }
  return !isPublicApiAuthPath(pathname);
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
  if (!isMutatingAppApiPath(url.pathname, request.method)) {
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
