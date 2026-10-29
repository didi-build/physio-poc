import type { PrescriptionType } from "./exercise-types.js";

export const PARAM_KEYS = [
  "reps",
  "sets",
  "hold_s",
  "ascent_s",
  "descent_s",
  "rest_s",
  "per_day",
  "days_per_week",
] as const;

export type ParamKey = (typeof PARAM_KEYS)[number];

export type NumericOrRange = number | { min: number; max: number };

export type ExerciseParams = Partial<Record<ParamKey, NumericOrRange>>;

export type ParamOverridesByType = Partial<Record<PrescriptionType, ExerciseParams>>;

/**
 * Inclusive bounds aligned to the approved web UI (design/reference/web-app/generated/programModel.ts
 * PARAM_META), cited from the approved design revision in design/app/exercise-library/spec.md.
 */
export const PARAM_VALUE_BOUNDS: Record<
  ParamKey,
  { min: number; max: number; integer: boolean }
> = {
  reps: { min: 1, max: 50, integer: true },
  sets: { min: 1, max: 10, integer: true },
  hold_s: { min: 1, max: 120, integer: true },
  ascent_s: { min: 1, max: 10, integer: true },
  descent_s: { min: 1, max: 10, integer: true },
  rest_s: { min: 10, max: 300, integer: true },
  per_day: { min: 1, max: 5, integer: true },
  days_per_week: { min: 1, max: 7, integer: true },
};

const PARAM_KEY_SET = new Set<string>(PARAM_KEYS);

const INTEGER_PARAM_KEYS = new Set<ParamKey>([
  "reps",
  "sets",
  "per_day",
  "days_per_week",
]);

const SECONDS_PARAM_KEYS = new Set<ParamKey>([
  "hold_s",
  "ascent_s",
  "descent_s",
  "rest_s",
]);

export class ParamValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParamValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBoundedNumber(
  value: number,
  key: string,
  bounds: { min: number; max: number; integer: boolean },
): number {
  if (!Number.isFinite(value)) {
    throw new ParamValidationError(`${key} must be a finite number`);
  }
  if (bounds.integer && !Number.isInteger(value)) {
    throw new ParamValidationError(`${key} must be a whole number`);
  }
  if (value < bounds.min || value > bounds.max) {
    throw new ParamValidationError(
      `${key} must be between ${bounds.min} and ${bounds.max}`,
    );
  }
  return value;
}

function validatePerDayRange(value: Record<string, unknown>): NumericOrRange {
  if (Object.keys(value).length !== 2 || !("min" in value) || !("max" in value)) {
    throw new ParamValidationError("Range for per_day must only have min and max");
  }
  const min = value.min;
  const max = value.max;
  if (typeof min !== "number" || typeof max !== "number") {
    throw new ParamValidationError("Invalid per_day range");
  }
  const bounds = PARAM_VALUE_BOUNDS.per_day;
  const minInt = validateBoundedNumber(min, "per_day.min", bounds);
  const maxInt = validateBoundedNumber(max, "per_day.max", bounds);
  if (minInt > maxInt) {
    throw new ParamValidationError("per_day range min must be <= max");
  }
  return { min: minInt, max: maxInt };
}

function validateParamValue(key: ParamKey, raw: unknown): NumericOrRange {
  const bounds = PARAM_VALUE_BOUNDS[key];

  if (key === "per_day") {
    if (typeof raw === "number") {
      return validateBoundedNumber(raw, key, bounds);
    }
    if (isPlainObject(raw)) {
      return validatePerDayRange(raw);
    }
    throw new ParamValidationError(`Invalid value for ${key}`);
  }

  if (INTEGER_PARAM_KEYS.has(key)) {
    if (typeof raw !== "number") {
      throw new ParamValidationError(`${key} must be a number`);
    }
    return validateBoundedNumber(raw, key, bounds);
  }

  if (SECONDS_PARAM_KEYS.has(key)) {
    if (typeof raw !== "number") {
      throw new ParamValidationError(`${key} must be a number`);
    }
    return validateBoundedNumber(raw, key, bounds);
  }

  throw new ParamValidationError(`Unknown param key: ${key}`);
}

export function parseExerciseParamsJson(json: string): ExerciseParams {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new ParamValidationError("Params JSON must be valid");
  }
  return validateExerciseParams(parsed);
}

export function validateExerciseParams(value: unknown): ExerciseParams {
  if (!isPlainObject(value)) {
    throw new ParamValidationError("Params must be a JSON object");
  }
  const result: ExerciseParams = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!PARAM_KEY_SET.has(key)) {
      throw new ParamValidationError(`Unknown param key: ${key}`);
    }
    result[key as ParamKey] = validateParamValue(key as ParamKey, raw);
  }
  return result;
}

export function validateParamOverridesByType(value: unknown): ParamOverridesByType {
  if (!isPlainObject(value)) {
    throw new ParamValidationError("Param overrides must be a JSON object");
  }
  const result: ParamOverridesByType = {};
  for (const [typeKey, params] of Object.entries(value)) {
    if (
      typeKey !== "stretching" &&
      typeKey !== "isometric" &&
      typeKey !== "concentric" &&
      typeKey !== "eccentric"
    ) {
      throw new ParamValidationError(
        `Unknown prescription type in overrides: ${typeKey}`,
      );
    }
    result[typeKey] = validateExerciseParams(params);
  }
  return result;
}

export function mergeExerciseParams(
  base: ExerciseParams,
  overlay: ExerciseParams,
): ExerciseParams {
  return { ...base, ...overlay };
}

export function exerciseParamsToJson(params: ExerciseParams): string {
  return JSON.stringify(params);
}
