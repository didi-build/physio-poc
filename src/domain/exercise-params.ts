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

function validatePositiveInteger(value: number, key: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ParamValidationError(`${key} must be a positive integer`);
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
  const minInt = validatePositiveInteger(min, "per_day.min");
  const maxInt = validatePositiveInteger(max, "per_day.max");
  if (minInt > maxInt) {
    throw new ParamValidationError("per_day range min must be <= max");
  }
  return { min: minInt, max: maxInt };
}

function validateParamValue(key: ParamKey, raw: unknown): NumericOrRange {
  if (key === "per_day") {
    if (typeof raw === "number") {
      return validatePositiveInteger(raw, key);
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
    const asInt = validatePositiveInteger(raw, key);
    if (key === "days_per_week" && (asInt < 1 || asInt > 7)) {
      throw new ParamValidationError("days_per_week must be between 1 and 7");
    }
    return asInt;
  }

  if (SECONDS_PARAM_KEYS.has(key)) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      throw new ParamValidationError(`${key} must be a non-negative number`);
    }
    return raw;
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
