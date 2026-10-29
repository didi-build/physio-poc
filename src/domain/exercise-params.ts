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

export class ParamValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParamValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateNumericOrRange(value: unknown, key: string): NumericOrRange {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (isPlainObject(value) && "min" in value && "max" in value) {
    const min = value.min;
    const max = value.max;
    if (
      typeof min === "number" &&
      typeof max === "number" &&
      Number.isFinite(min) &&
      Number.isFinite(max) &&
      min <= max
    ) {
      if (Object.keys(value).length !== 2) {
        throw new ParamValidationError(`Range for ${key} must only have min and max`);
      }
      return { min, max };
    }
  }
  throw new ParamValidationError(`Invalid value for ${key}`);
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
    result[key as ParamKey] = validateNumericOrRange(raw, key);
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
