import { exerciseLibraryPractitionerPathHttpRouteCases } from "./exercise-library-practitioner-path-route-cases.js";
import { exerciseMediaHttpRouteCases } from "../../src/http/routes/exercise-media.js";

export type PractitionerPathRouteSample = {
  readonly ruleId: string;
  readonly method: string;
  readonly samplePath: string;
};

export type PractitionerPathRouteHandlerTable = {
  readonly ruleId: string;
  readonly routes: (
    practitionerId: string,
    exerciseId: string,
    versionId: string,
  ) => readonly { method: string; path: string }[];
};

const EXAMPLE_PRACTITIONER_ID = "11111111-1111-4111-8111-111111111111";
const EXAMPLE_EXERCISE_ID = "ex-example";
const EXAMPLE_VERSION_ID = "ver-example";

/** Handler-owned route tables merged into practitioner path route samples. */
export const PRACTITIONER_PATH_ROUTE_HANDLER_TABLES: readonly PractitionerPathRouteHandlerTable[] =
  [
    {
      ruleId: "exercise-library",
      routes: (practitionerId, exerciseId) =>
        exerciseLibraryPractitionerPathHttpRouteCases(practitionerId, exerciseId),
    },
    {
      ruleId: "exercise-media",
      routes: (practitionerId, _exerciseId, versionId) =>
        exerciseMediaHttpRouteCases(practitionerId, versionId).filter((routeCase) =>
          routeCase.path.startsWith("/api/practitioners/"),
        ),
    },
  ];

export function buildPractitionerPathRouteSamples(
  practitionerId: string = EXAMPLE_PRACTITIONER_ID,
  exerciseId: string = EXAMPLE_EXERCISE_ID,
  versionId: string = EXAMPLE_VERSION_ID,
): PractitionerPathRouteSample[] {
  const samples: PractitionerPathRouteSample[] = [];
  for (const table of PRACTITIONER_PATH_ROUTE_HANDLER_TABLES) {
    for (const routeCase of table.routes(practitionerId, exerciseId, versionId)) {
      samples.push({
        ruleId: table.ruleId,
        method: routeCase.method,
        samplePath: routeCase.path,
      });
    }
  }
  return samples;
}

export function practitionerPathRouteSampleKeysFromHandlerTables(
  practitionerId: string = EXAMPLE_PRACTITIONER_ID,
  exerciseId: string = EXAMPLE_EXERCISE_ID,
  versionId: string = EXAMPLE_VERSION_ID,
): string[] {
  return buildPractitionerPathRouteSamples(practitionerId, exerciseId, versionId)
    .map(practitionerPathRouteSampleKey)
    .sort();
}

export const PRACTITIONER_PATH_ROUTE_SAMPLES: readonly PractitionerPathRouteSample[] =
  buildPractitionerPathRouteSamples();

export function practitionerPathRouteSampleKey(
  sample: PractitionerPathRouteSample,
): string {
  return `${sample.method} ${sample.samplePath}`;
}

function routeCaseKey(routeCase: { method: string; path: string }): string {
  return `${routeCase.method} ${routeCase.path}`;
}

/** Route case keys derived directly from handler-owned route case helpers (not via the merge tables). */
export function canonicalPractitionerPathRouteCaseKeys(
  practitionerId: string = EXAMPLE_PRACTITIONER_ID,
  exerciseId: string = EXAMPLE_EXERCISE_ID,
  versionId: string = EXAMPLE_VERSION_ID,
): string[] {
  const keys: string[] = [];
  for (const routeCase of exerciseLibraryPractitionerPathHttpRouteCases(
    practitionerId,
    exerciseId,
  )) {
    keys.push(routeCaseKey(routeCase));
  }
  for (const routeCase of exerciseMediaHttpRouteCases(practitionerId, versionId)) {
    if (!routeCase.path.startsWith("/api/practitioners/")) {
      continue;
    }
    keys.push(routeCaseKey(routeCase));
  }
  return keys.sort();
}
