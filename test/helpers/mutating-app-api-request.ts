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

export function mutatingAppApiRequestInit(
  url: string,
  init: RequestInit = {},
): RequestInit {
  const headers = new Headers(init.headers);
  applyMutatingAppApiRequestHeaders(headers, init.method ?? "GET", url);
  return { ...init, headers };
}
