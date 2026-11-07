import type { PrescriptionType } from "../../domain/exercise-types.js";
import {
  exerciseParamsEqual,
  type ExerciseParams,
} from "../../domain/exercise-params.js";
import type { RoutinePersonalChanges } from "./types.js";

/** Row fields used for same-position personal baseline comparison (domain-normalized). */
export type RoutineRowComparable = {
  exercise_id: string;
  exercise_version_id: string;
  prescription_type: PrescriptionType;
  params: ExerciseParams;
};

function rowComparableEqual(a: RoutineRowComparable, b: RoutineRowComparable): boolean {
  return (
    a.exercise_id === b.exercise_id &&
    a.exercise_version_id === b.exercise_version_id &&
    a.prescription_type === b.prescription_type &&
    exerciseParamsEqual(a.params, b.params)
  );
}

/**
 * Positional personal change semantics (approved concept 547–549, 1641–1650):
 * compare current rows to baseline at the same index; count differing positions plus
 * max(0, baselineLength − currentLength).
 */
export function projectPersonalChanges(
  baselineRows: RoutineRowComparable[],
  currentRows: RoutineRowComparable[],
): RoutinePersonalChanges {
  const your_change_positions: number[] = [];
  for (let i = 0; i < currentRows.length; i += 1) {
    const cur = currentRows[i]!;
    const base = baselineRows[i];
    if (base === undefined || !rowComparableEqual(base, cur)) {
      your_change_positions.push(i);
    }
  }
  const change_count =
    your_change_positions.length +
    Math.max(0, baselineRows.length - currentRows.length);
  return {
    baseline_available: true,
    change_count,
    your_change_positions,
  };
}

export function personalChangesUnavailable(): RoutinePersonalChanges {
  return {
    baseline_available: false,
    change_count: 0,
    your_change_positions: [],
  };
}
