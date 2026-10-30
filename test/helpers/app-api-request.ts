import { mutatingAppApiRequestInit } from "../../src/ui/api/mutating-app-api-request.js";

/** Builds app HTTP requests with DIDI-1092 CSRF headers on mutating methods. */
export function appApiRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, mutatingAppApiRequestInit(url, init));
}

export function authedAppApiRequest(
  url: string,
  cookie: string,
  init: RequestInit = {},
): Request {
  const merged = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(merged.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...merged, headers });
}
