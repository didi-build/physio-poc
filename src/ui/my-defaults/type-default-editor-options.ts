import type { NumericOrRange } from "../../domain/exercise-params.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";

/** Per-day choices with verbatim readout on mock 01 (stretching global). */
export const APPROVED_PER_DAY_SELECT_OPTIONS: NumericOrRange[] = [{ min: 1, max: 3 }];

export function perDayOptionValue(value: NumericOrRange): string {
  if (typeof value === "number") {
    return String(value);
  }
  return `${value.min}-${value.max}`;
}

export function approvedPerDayOptions(): {
  value: NumericOrRange;
  label: string;
  optionValue: string;
}[] {
  return APPROVED_PER_DAY_SELECT_OPTIONS.map((value) => {
    const label = formatExerciseParams({ per_day: value });
    return { value, label, optionValue: perDayOptionValue(value) };
  }).filter((entry) => entry.label.length > 0);
}

export function perDayValueHasApprovedLabel(
  value: NumericOrRange | undefined,
): boolean {
  if (value === undefined) {
    return true;
  }
  return approvedPerDayOptions().some(
    (option) => perDayOptionValue(option.value) === perDayOptionValue(value),
  );
}

export function matchApprovedPerDayOptionValue(
  value: NumericOrRange | undefined,
): string {
  const options = approvedPerDayOptions();
  if (value === undefined && options[0]) {
    return options[0].optionValue;
  }
  const target = value === undefined ? undefined : perDayOptionValue(value);
  const match = options.find((option) => option.optionValue === target);
  return match?.optionValue ?? options[0]?.optionValue ?? "1-3";
}
