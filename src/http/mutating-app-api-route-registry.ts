import {
  exerciseLibraryMutatingHttpRouteCases,
  type ExerciseLibraryMutatingHttpRouteCase,
} from "./routes/exercise-library.js";
import {
  exerciseMediaHttpRouteCases,
  type ExerciseMediaHttpRouteCase,
} from "./routes/exercise-media.js";

const EXAMPLE_PRACTITIONER_ID = "11111111-1111-4111-8111-111111111111";
const EXAMPLE_EXERCISE_ID = "ex-example";
const EXAMPLE_VERSION_ID = "ver-example";

export type MutatingAppApiRouteSample = {
  readonly ruleId: string;
  readonly samplePath: string;
  readonly method: string;
};

export type MutatingAppApiHandlerRouteTable = {
  readonly ruleId: string;
  readonly routes: (
    practitionerId: string,
    exerciseId: string,
    versionId: string,
  ) => readonly { method: string; path: string }[];
};

/** Handler-owned mutating route tables merged into `MUTATING_APP_API_ROUTE_SAMPLES`. */
export const MUTATING_APP_API_HANDLER_ROUTE_TABLES: readonly MutatingAppApiHandlerRouteTable[] =
  [
    {
      ruleId: "exercise-library-my-exercises",
      routes: (practitionerId, exerciseId) =>
        exerciseLibraryMutatingHttpRouteCases(practitionerId, exerciseId),
    },
    {
      ruleId: "exercise-media",
      routes: (practitionerId, _exerciseId, versionId) =>
        exerciseMediaHttpRouteCases(practitionerId, versionId).filter(
          (routeCase) => routeCase.method !== "GET",
        ),
    },
  ];

export function buildMutatingAppApiRouteSamples(
  practitionerId: string = EXAMPLE_PRACTITIONER_ID,
  exerciseId: string = EXAMPLE_EXERCISE_ID,
  versionId: string = EXAMPLE_VERSION_ID,
): MutatingAppApiRouteSample[] {
  const samples: MutatingAppApiRouteSample[] = [];
  for (const table of MUTATING_APP_API_HANDLER_ROUTE_TABLES) {
    for (const routeCase of table.routes(practitionerId, exerciseId, versionId)) {
      samples.push({
        ruleId: table.ruleId,
        samplePath: routeCase.path,
        method: routeCase.method,
      });
    }
  }
  return samples;
}

export function mutatingAppApiRouteSampleKeysFromHandlerTables(
  practitionerId: string = EXAMPLE_PRACTITIONER_ID,
  exerciseId: string = EXAMPLE_EXERCISE_ID,
  versionId: string = EXAMPLE_VERSION_ID,
): string[] {
  return buildMutatingAppApiRouteSamples(practitionerId, exerciseId, versionId)
    .map(mutatingAppApiRouteSampleKey)
    .sort();
}

export const MUTATING_APP_API_ROUTE_SAMPLES: readonly MutatingAppApiRouteSample[] =
  buildMutatingAppApiRouteSamples();

export function mutatingAppApiRouteSampleKey(
  sample: MutatingAppApiRouteSample,
): string {
  return `${sample.method} ${sample.samplePath}`;
}

export type { ExerciseLibraryMutatingHttpRouteCase, ExerciseMediaHttpRouteCase };
