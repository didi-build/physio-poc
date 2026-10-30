const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function applyMutatingAppApiRequestHeaders(
  headers: Headers,
  method: string,
  requestUrl: string,
): void {
  if (!MUTATING_METHODS.has(method.toUpperCase())) {
    return;
  }
  if (!headers.has("origin")) {
    headers.set("origin", new URL(requestUrl).origin);
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
}

/** Same-origin Origin and JSON content-type for DIDI-1092 default-on CSRF guard. */
export function mutatingAppApiRequestInit(
  absoluteRequestUrl: string,
  init: RequestInit = {},
): RequestInit {
  const headers = new Headers(init.headers);
  applyMutatingAppApiRequestHeaders(headers, init.method ?? "GET", absoluteRequestUrl);
  return { ...init, headers };
}

export function mutatingAppApiRequestInitForRelativePath(
  path: string,
  init: RequestInit = {},
  origin = "http://127.0.0.1",
): RequestInit {
  const absolute = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  return mutatingAppApiRequestInit(absolute, init);
}
