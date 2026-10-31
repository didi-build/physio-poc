import type { ParamKey } from "./exercise-params.js";
import type { PrescriptionType } from "./exercise-types.js";
import { PRESCRIPTION_TYPES } from "./exercise-types.js";

/** Core params shown by default for each type (aligned to approved programModel.ts). */
export const TYPE_DEFAULT_CORE_PARAMS: Record<PrescriptionType, readonly ParamKey[]> = {
  stretching: ["hold_s", "per_day", "days_per_week"],
  isometric: ["reps", "hold_s", "sets", "days_per_week"],
  concentric: ["reps", "hold_s", "sets", "days_per_week"],
  eccentric: ["reps", "descent_s", "sets", "days_per_week"],
};

/** Optional params a practitioner may add on My defaults ("Add parameter"). */
export const TYPE_DEFAULT_ADDABLE_PARAMS: readonly ParamKey[] = ["descent_s", "rest_s"];

export function addableTypeDefaultParams(
  type: PrescriptionType,
  params: Partial<Record<ParamKey, unknown>>,
): ParamKey[] {
  const core = new Set(TYPE_DEFAULT_CORE_PARAMS[type]);
  return TYPE_DEFAULT_ADDABLE_PARAMS.filter(
    (key) => !core.has(key) && params[key] === undefined,
  );
}

export const MY_DEFAULTS_EXERCISE_TYPES = PRESCRIPTION_TYPES;
