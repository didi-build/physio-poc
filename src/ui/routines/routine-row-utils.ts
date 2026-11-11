import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../domain/global-type-defaults-seed.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import type { ExerciseDetailsResult } from "../../services/exercise-library/types.js";
import type { RoutineExerciseRow } from "../../services/routines/types.js";

export function defaultPrescriptionTypeForExercise(
  details: ExerciseDetailsResult,
): PrescriptionType {
  const allowed = details.allowed_prescription_types;
  if (allowed.includes("stretching")) {
    return "stretching";
  }
  return (allowed[0] ?? "stretching") as PrescriptionType;
}

export function buildRoutineRowFromExerciseDetails(
  details: ExerciseDetailsResult,
  position: number,
): RoutineExerciseRow {
  const prescriptionType = defaultPrescriptionTypeForExercise(details);
  return {
    position,
    exercise_id: details.exercise_id,
    exercise_version_id: details.exercise_version_id,
    exercise_name: details.library.title,
    prescription_type: prescriptionType,
    params: { ...GLOBAL_TYPE_DEFAULTS_SEED[prescriptionType] },
  };
}

export function reindexRoutineRows(rows: RoutineExerciseRow[]): RoutineExerciseRow[] {
  return rows.map((row, index) => ({ ...row, position: index }));
}
