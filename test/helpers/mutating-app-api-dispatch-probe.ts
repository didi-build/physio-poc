import { FakeAuthPort } from "../../src/auth/fake-auth-port.js";
import type { AppDependencies } from "../../src/http/app.js";
import { handleRequest } from "../../src/http/app.js";
import { requiresAppApiCsrfGuard } from "../../src/http/mutating-app-api-csrf.js";
import {
  buildMutatingAppApiRouteSamples,
  mutatingAppApiRouteSampleKey,
} from "./mutating-app-api-route-registry.js";

const DISPATCH_PROBE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

function uniqueMutatingAppApiProbePaths(
  practitionerId: string,
  exerciseId: string,
  versionId: string,
): string[] {
  const paths = new Set<string>();
  for (const sample of buildMutatingAppApiRouteSamples(
    practitionerId,
    exerciseId,
    versionId,
  )) {
    paths.add(sample.samplePath);
  }
  return [...paths].sort();
}

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

/** Test-only: keys where `handleRequest` returns non-404 on registry paths. */
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
      if (!requiresAppApiCsrfGuard(path, method)) {
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
