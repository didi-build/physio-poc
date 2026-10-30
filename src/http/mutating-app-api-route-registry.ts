import { exerciseMediaHttpRouteCases } from "./routes/exercise-media.js";

const EXAMPLE_PRACTITIONER_ID = "11111111-1111-4111-8111-111111111111";
const EXAMPLE_EXERCISE_ID = "ex-example";
const EXAMPLE_VERSION_ID = "ver-example";

export type MutatingAppApiRouteSample = {
  readonly ruleId: string;
  readonly samplePath: string;
  readonly method: string;
};

const EXERCISE_LIBRARY_MUTATIONS: readonly MutatingAppApiRouteSample[] = [
  {
    ruleId: "exercise-library-my-exercises",
    samplePath: `/api/practitioners/${EXAMPLE_PRACTITIONER_ID}/my-exercises/${EXAMPLE_EXERCISE_ID}`,
    method: "POST",
  },
  {
    ruleId: "exercise-library-my-exercises",
    samplePath: `/api/practitioners/${EXAMPLE_PRACTITIONER_ID}/my-exercises/${EXAMPLE_EXERCISE_ID}`,
    method: "PATCH",
  },
  {
    ruleId: "exercise-library-my-exercises",
    samplePath: `/api/practitioners/${EXAMPLE_PRACTITIONER_ID}/my-exercises/${EXAMPLE_EXERCISE_ID}`,
    method: "DELETE",
  },
];

export const MUTATING_APP_API_ROUTE_SAMPLES: readonly MutatingAppApiRouteSample[] = [
  ...EXERCISE_LIBRARY_MUTATIONS,
  ...exerciseMediaHttpRouteCases(EXAMPLE_PRACTITIONER_ID, EXAMPLE_VERSION_ID)
    .filter((routeCase) => routeCase.method !== "GET")
    .map((routeCase) => ({
      ruleId: "exercise-media",
      samplePath: routeCase.path,
      method: routeCase.method,
    })),
];

export function mutatingAppApiRouteSampleKey(
  sample: MutatingAppApiRouteSample,
): string {
  return `${sample.method} ${sample.samplePath}`;
}
