import type { ParamKey, ExerciseParams, NumericOrRange } from "./exercise-params.js";

const PARAM_DISPLAY_ORDER: ParamKey[] = [
  "reps",
  "hold_s",
  "ascent_s",
  "descent_s",
  "sets",
  "rest_s",
  "per_day",
  "days_per_week",
];

function keysInDisplayOrder(params: ExerciseParams): ParamKey[] {
  return PARAM_DISPLAY_ORDER.filter((key) => params[key] !== undefined);
}

/** Range readout approved on mock 01 (stretching global default). */
function perDayDisplay(value: NumericOrRange): string {
  if (typeof value === "number") {
    return "";
  }
  if (value.min === value.max) {
    return perDayDisplay(value.min);
  }
  return `${value.min} to ${value.max} times a day`;
}

export function paramPhrase(key: ParamKey, value: NumericOrRange): string {
  const n = typeof value === "number" ? value : null;
  switch (key) {
    case "reps":
      return n === 1 ? "1 rep" : `${n} reps`;
    case "sets":
      if (n === null || n <= 1) {
        return "";
      }
      return `${n} sets`;
    case "hold_s":
      return `${n}s hold`;
    case "ascent_s":
      return "";
    case "descent_s":
      return `${n}s down`;
    case "rest_s":
      return `${n}s rest between sets`;
    case "per_day":
      return perDayDisplay(value);
    case "days_per_week":
      return n === 7 ? "every day" : `${n}x a week`;
    default:
      return "";
  }
}

/** Human-readable prescription params (matches approved MagicPath readout). */
export function formatExerciseParams(params: ExerciseParams): string {
  return keysInDisplayOrder(params)
    .map((key) => paramPhrase(key, params[key] as NumericOrRange))
    .filter((phrase) => phrase.length > 0)
    .join(", ");
}

export function exerciseParamsKeys(params: ExerciseParams): ParamKey[] {
  return keysInDisplayOrder(params);
}

/** Non-empty when the param has an approved readout phrase for accessibility labels. */
export function paramAccessibleName(
  key: ParamKey,
  value: NumericOrRange | undefined,
  fallback: NumericOrRange,
): string | null {
  const resolved = value ?? fallback;
  const phrase = paramPhrase(key, resolved);
  return phrase.length > 0 ? phrase : null;
}

/** Input aria names: stable approved label from the field fallback, not the draft readout. */
export function paramInputAccessibleName(
  key: ParamKey,
  value: NumericOrRange | undefined,
  fallback: NumericOrRange,
): string {
  const fromFieldLabel = paramAccessibleName(key, fallback, fallback);
  if (fromFieldLabel) {
    return fromFieldLabel;
  }
  const resolved = value ?? fallback;
  if (typeof resolved === "number") {
    return String(resolved);
  }
  return `${resolved.min}-${resolved.max}`;
}
