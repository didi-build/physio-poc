import { isMutatingAppApiPath } from "./mutating-app-api-csrf.js";
import {
  buildMutatingAppApiRouteSamples,
  mutatingAppApiRouteSampleKey,
} from "./mutating-app-api-route-registry.js";

const EXAMPLE_EXERCISE_ID = "ex-example";
const EXAMPLE_VERSION_ID = "ver-example";

export type MutatingAppApiRouteContext = {
  readonly practitionerId: string;
  readonly exerciseId: string;
  readonly versionId: string;
};

/** Parses ids from pathname shapes listed in handler mutating route tables. */
export function parseMutatingAppApiRouteContext(
  pathname: string,
): MutatingAppApiRouteContext | null {
  const myItem = pathname.match(
    /^\/api\/practitioners\/([^/]+)\/my-exercises\/([^/]+)$/,
  );
  if (myItem) {
    return {
      practitionerId: myItem[1] ?? "",
      exerciseId: myItem[2] ?? "",
      versionId: EXAMPLE_VERSION_ID,
    };
  }
  const media = pathname.match(
    /^\/api\/practitioners\/([^/]+)\/exercise-versions\/([^/]+)\/media\/(?:generate|regenerate)$/,
  );
  if (media) {
    return {
      practitionerId: media[1] ?? "",
      exerciseId: EXAMPLE_EXERCISE_ID,
      versionId: media[2] ?? "",
    };
  }
  return null;
}

/** True when the mutating request matches a row in `MUTATING_APP_API_ROUTE_SAMPLES`. */
export function isRegisteredMutatingAppApiRoute(
  pathname: string,
  method: string,
): boolean {
  if (!isMutatingAppApiPath(pathname, method)) {
    return true;
  }
  const context = parseMutatingAppApiRouteContext(pathname);
  if (!context) {
    return false;
  }
  const key = mutatingAppApiRouteSampleKey({
    ruleId: "",
    samplePath: pathname,
    method,
  });
  return buildMutatingAppApiRouteSamples(
    context.practitionerId,
    context.exerciseId,
    context.versionId,
  )
    .map(mutatingAppApiRouteSampleKey)
    .includes(key);
}

export function uniqueMutatingAppApiProbePaths(
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
