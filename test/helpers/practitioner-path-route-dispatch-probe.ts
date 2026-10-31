import { FakeAuthPort } from "../../src/auth/fake-auth-port.js";
import type { AppDependencies } from "../../src/http/app.js";
import { handleRequest } from "../../src/http/app.js";
import {
  buildPractitionerPathRouteSamples,
  practitionerPathRouteSampleKey,
} from "../../src/http/practitioner-path-route-registry.js";
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

/** Test-only: keys where `handleRequest` returns non-404 on registry practitioner path samples. */
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
  for (const sample of buildPractitionerPathRouteSamples(
    practitionerId,
    exerciseId,
    versionId,
  )) {
    const init = mutatingAppApiRequestInit(`${baseUrl}${sample.samplePath}`, {
      method: sample.method,
      headers: probeRequestHeaders(baseUrl, cookie, sample.method),
      body: probeRequestBody(sample.samplePath, sample.method),
    });
    const response = await handleRequest(
      new Request(`${baseUrl}${sample.samplePath}`, init),
      deps,
    );
    if (response.status !== 404) {
      keys.push(
        practitionerPathRouteSampleKey({
          ruleId: sample.ruleId,
          method: sample.method,
          samplePath: sample.samplePath,
        }),
      );
    }
  }
  return keys.sort();
}
