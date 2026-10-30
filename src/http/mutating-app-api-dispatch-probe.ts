import { FakeAuthPort } from "../auth/fake-auth-port.js";
import type { AppDependencies } from "./app.js";
import { handleRequest } from "./app.js";
import { isMutatingAppApiPath } from "./mutating-app-api-csrf.js";
import { uniqueMutatingAppApiProbePaths } from "./mutating-app-api-route-gate.js";
import { mutatingAppApiRouteSampleKey } from "./mutating-app-api-route-registry.js";

const DISPATCH_PROBE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

function probeRequestBody(path: string, method: string): string | undefined {
  if (method === "DELETE") {
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

function probeRequestHeaders(baseUrl: string, cookie: string): HeadersInit {
  return {
    cookie,
    origin: new URL(baseUrl).origin,
    "content-type": "application/json",
  };
}

/**
 * Mutating route keys where `handleRequest` (Worker entry) returns a non-404 response,
 * probing every mutating method on each registry path.
 */
export async function probedMutatingAppApiRouteKeys(
  deps: AppDependencies,
  practitionerId: string,
  exerciseId: string,
  versionId: string,
  baseUrl: string,
): Promise<string[]> {
  const auth = deps.auth as FakeAuthPort;
  const cookie = auth.createSessionCookieHeader();
  const keys: string[] = [];
  for (const path of uniqueMutatingAppApiProbePaths(
    practitionerId,
    exerciseId,
    versionId,
  )) {
    for (const method of DISPATCH_PROBE_METHODS) {
      if (!isMutatingAppApiPath(path, method)) {
        continue;
      }
      const response = await handleRequest(
        new Request(`${baseUrl}${path}`, {
          method,
          headers: probeRequestHeaders(baseUrl, cookie),
          body: probeRequestBody(path, method),
        }),
        deps,
      );
      if (response.status !== 404) {
        keys.push(
          mutatingAppApiRouteSampleKey({ ruleId: "", samplePath: path, method }),
        );
      }
    }
  }
  return keys.sort();
}
