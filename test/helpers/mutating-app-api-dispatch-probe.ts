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
  if (path.includes("/api/me/programs/link-approved-placeholders")) {
    return JSON.stringify({
      exercise_request_id: "11111111-1111-4111-8111-111111111111",
      approved_version_id: "11111111-1111-4111-8111-111111111112",
    });
  }
  if (path.startsWith("/api/me/programs")) {
    if (path.endsWith("/restore")) {
      return undefined;
    }
    if (path.endsWith("/rows/reorder")) {
      return JSON.stringify({ ordered_row_ids: [] });
    }
    if (path.endsWith("/duplicate")) {
      return JSON.stringify({ new_row_id: "11111111-1111-4111-8111-111111111113" });
    }
    if (
      path.endsWith("/library-update/apply") ||
      path.endsWith("/library-update/keep")
    ) {
      return JSON.stringify({});
    }
    if (path.endsWith("/rows") && method === "POST") {
      return JSON.stringify({
        row_id: "11111111-1111-4111-8111-111111111114",
        exercise_id: "11111111-1111-4111-8111-111111111115",
      });
    }
    if (method === "POST" && path === "/api/me/programs") {
      return JSON.stringify({ program_id: "11111111-1111-4111-8111-111111111116" });
    }
    if (method === "PATCH") {
      if (path.includes("/rows/")) {
        return JSON.stringify({ params: { hold_s: 5 } });
      }
      return JSON.stringify({ name: "Probe" });
    }
    return JSON.stringify({});
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
