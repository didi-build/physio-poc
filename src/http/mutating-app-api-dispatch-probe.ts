import type { PractitionerSession } from "../auth/auth-port.js";
import type { AppDependencies } from "./app.js";
import { isMutatingAppApiPath } from "./mutating-app-api-csrf.js";
import {
  MUTATING_APP_API_HANDLER_ROUTE_TABLES,
  mutatingAppApiRouteSampleKey,
} from "./mutating-app-api-route-registry.js";
import { handleExerciseLibraryRequest } from "./routes/exercise-library.js";
import { handleExerciseMediaRequest } from "./routes/exercise-media.js";

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

function uniqueProbePaths(
  practitionerId: string,
  exerciseId: string,
  versionId: string,
): string[] {
  const paths = new Set<string>();
  for (const table of MUTATING_APP_API_HANDLER_ROUTE_TABLES) {
    for (const routeCase of table.routes(practitionerId, exerciseId, versionId)) {
      paths.add(routeCase.path);
    }
  }
  return [...paths].sort();
}

async function dispatchAppApiRoute(
  request: Request,
  deps: AppDependencies,
  sessionPractitioner: PractitionerSession,
): Promise<Response | null> {
  const exerciseResponse = await handleExerciseLibraryRequest(request, deps, {
    sessionPractitioner,
  });
  if (exerciseResponse) {
    return exerciseResponse;
  }
  return handleExerciseMediaRequest(request, deps);
}

/**
 * Keys for mutating app API routes the HTTP handlers dispatch for the probed method,
 * discovered by probing every mutating method on handler-table paths (405 excluded).
 */
export async function probedMutatingAppApiRouteKeys(
  deps: AppDependencies,
  sessionPractitioner: PractitionerSession,
  practitionerId: string,
  exerciseId: string,
  versionId: string,
  baseUrl: string,
): Promise<string[]> {
  const keys: string[] = [];
  for (const path of uniqueProbePaths(practitionerId, exerciseId, versionId)) {
    for (const method of DISPATCH_PROBE_METHODS) {
      if (!isMutatingAppApiPath(path, method)) {
        continue;
      }
      const request = new Request(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: probeRequestBody(path, method),
      });
      const response = await dispatchAppApiRoute(request, deps, sessionPractitioner);
      if (response && response.status !== 405) {
        keys.push(
          mutatingAppApiRouteSampleKey({ ruleId: "", samplePath: path, method }),
        );
      }
    }
  }
  return keys.sort();
}
