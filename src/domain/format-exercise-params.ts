import type { ParamKey, ExerciseParams, NumericOrRange } from "./exercise-params.js";
import { myDefaultsPendingCopySlots } from "../ui/copy/my-defaults-pending-copy.js";

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
  const copy = myDefaultsPendingCopySlots;
  if (typeof value === "number") {
    if (value === 1) {
      return copy.readoutOnceADay ?? "";
    }
    if (value === 2) {
      return copy.readoutTwiceADay ?? "";
    }
    return copy.readoutPerDayTimes?.(value) ?? "";
  }
  if (value.min === value.max) {
    return perDayDisplay(value.min);
  }
  return copy.readoutPerDayRange?.(value.min, value.max) ?? "";
}

export function paramPhrase(key: ParamKey, value: NumericOrRange): string {
  const copy = myDefaultsPendingCopySlots;
  const n = typeof value === "number" ? value : null;
  switch (key) {
    case "reps":
      return n === 1 ? "1 rep" : `${n} reps`;
    case "sets":
      if (n === null || n <= 1) {
        return n === 1 ? (copy.readoutOneSet ?? "") : "";
      }
      return copy.readoutNSets?.(n) ?? "";
    case "hold_s":
      return `${n}s hold`;
    case "ascent_s":
      return n === null ? "" : (copy.readoutSecondsUp?.(n) ?? "");
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

/** Human-readable prescription params (approved readout slots only). */
export function formatExerciseParams(params: ExerciseParams): string {
  return keysInDisplayOrder(params)
    .map((key) => paramPhrase(key, params[key] as NumericOrRange))
    .filter((phrase) => phrase.length > 0)
    .join(", ");
}

export function exerciseParamsKeys(params: ExerciseParams): ParamKey[] {
  return keysInDisplayOrder(params);
}
