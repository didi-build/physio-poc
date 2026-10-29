import type { PrescriptionType } from "./exercise-types.js";
import {
  mergeExerciseParams,
  type ExerciseParams,
  type ParamOverridesByType,
} from "./exercise-params.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "./global-type-defaults-seed.js";

export type ResolvedParamsSource =
  "exercise_override" | "practitioner_defaults" | "global_defaults";

export type ResolvedExerciseParams = {
  params: ExerciseParams;
  source: ResolvedParamsSource;
};

/**
 * Oct 24 addendum precedence: my exercise override, then my type defaults, then global.
 */
export function resolveExerciseParams(input: {
  prescriptionType: PrescriptionType;
  paramOverrides: ParamOverridesByType;
  practitionerTypeDefaults: ExerciseParams;
  globalTypeDefaults?: ExerciseParams;
}): ResolvedExerciseParams {
  const globalDefaults =
    input.globalTypeDefaults ?? GLOBAL_TYPE_DEFAULTS_SEED[input.prescriptionType] ?? {};

  const practitionerMerged = mergeExerciseParams(
    globalDefaults,
    input.practitionerTypeDefaults,
  );

  const exerciseOverride = input.paramOverrides[input.prescriptionType];
  if (exerciseOverride && Object.keys(exerciseOverride).length > 0) {
    return {
      params: mergeExerciseParams(practitionerMerged, exerciseOverride),
      source: "exercise_override",
    };
  }

  if (Object.keys(input.practitionerTypeDefaults).length > 0) {
    return {
      params: practitionerMerged,
      source: "practitioner_defaults",
    };
  }

  return {
    params: globalDefaults,
    source: "global_defaults",
  };
}
