import type { ExerciseParams, ParamKey } from "./exercise-params.js";
import { paramPhrase } from "./format-exercise-params.js";

const LINE_1_KEYS: ParamKey[] = ["reps", "hold_s", "ascent_s", "descent_s"];
const LINE_2_KEYS: ParamKey[] = ["sets", "rest_s"];
const LINE_3_KEYS: ParamKey[] = ["days_per_week", "per_day"];

function phrasesForKeys(params: ExerciseParams, keys: ParamKey[]): string[] {
  return keys
    .filter((key) => params[key] !== undefined)
    .map((key) => paramPhrase(key, params[key]!))
    .filter((phrase) => phrase.length > 0);
}

/** Three dose lines per design/app/programs/spec.md (DIDI-1192). */
export function linkPageDoseLines(params: ExerciseParams): string[][] {
  const lines = [
    phrasesForKeys(params, LINE_1_KEYS),
    phrasesForKeys(params, LINE_2_KEYS),
    phrasesForKeys(params, LINE_3_KEYS),
  ];
  return lines.filter((line) => line.length > 0);
}
