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

function perDayDisplay(value: NumericOrRange): string {
  if (typeof value === "number") {
    if (value === 1) {
      return "once a day";
    }
    if (value === 2) {
      return "twice a day";
    }
    return `${value} times a day`;
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
      return n === 1 ? "1 set" : `${n} sets`;
    case "hold_s":
      return `${n}s hold`;
    case "ascent_s":
      return `${n}s up`;
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
    .join(", ");
}

export function exerciseParamsKeys(params: ExerciseParams): ParamKey[] {
  return keysInDisplayOrder(params);
}
