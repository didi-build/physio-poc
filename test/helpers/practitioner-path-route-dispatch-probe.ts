import { FakeAuthPort } from "../../src/auth/fake-auth-port.js";
import type { AppDependencies } from "../../src/http/app.js";
import { handleRequest } from "../../src/http/app.js";
import { canonicalPractitionerPathRouteCaseKeys } from "../../src/http/practitioner-path-route-registry.js";
import { mutatingAppApiRequestInit } from "./mutating-app-api-request.js";

function probeRequestBody(path: string, method: string): string | undefined {
  if (method === "GET" || method === "DELETE") {
    return undefined;
  }
  if (path.includes("/media/regenerate")) {
    return JSON.stringify({ scope: "both", note: null });
  }
  if (path.includes("/media/generate")) {
    return JSON.stringify({});
  }
  if (method === "PATCH") {
    return JSON.stringify({ text_overrides: { title: "probe" } });
  }
  return JSON.stringify({ action: "save" });
}

function probeRequestHeaders(
  baseUrl: string,
  cookie: string,
  method: string,
): HeadersInit {
  const headers: Record<string, string> = { cookie };
  if (method !== "GET" && method !== "HEAD") {
    headers.origin = new URL(baseUrl).origin;
    headers["content-type"] = "application/json";
  }
  return headers;
}

/** Test-only: keys where `handleRequest` returns non-404 on canonical practitioner path routes. */
export async function probedPractitionerPathRouteKeys(
  deps: AppDependencies,
  practitionerId: string,
  exerciseId: string,
  versionId: string,
  baseUrl: string,
): Promise<string[]> {
  const auth = deps.auth as FakeAuthPort;
  const cookie = auth.createSessionCookieHeader();
  const keys: string[] = [];
  for (const key of canonicalPractitionerPathRouteCaseKeys(
    practitionerId,
    exerciseId,
    versionId,
  )) {
    const space = key.indexOf(" ");
    const method = key.slice(0, space);
    const samplePath = key.slice(space + 1);
    const init = mutatingAppApiRequestInit(`${baseUrl}${samplePath}`, {
      method,
      headers: probeRequestHeaders(baseUrl, cookie, method),
      body: probeRequestBody(samplePath, method),
    });
    const response = await handleRequest(
      new Request(`${baseUrl}${samplePath}`, init),
      deps,
    );
    if (response.status === 404) {
      const body = (await response.clone().json()) as { error?: string };
      if (body.error === "not_found") {
        continue;
      }
    }
    keys.push(key);
  }
  return keys.sort();
}
