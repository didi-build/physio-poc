import type { ProgramBuilderRow } from "../../services/programs/types.js";

export function versionNumbersForRow(row: ProgramBuilderRow): number[] {
  return row.exercise_version_choices.map((choice) => choice.version_number);
}

export function exerciseVersionIdForNumber(
  row: ProgramBuilderRow,
  versionNumber: number,
): string | null {
  const match = row.exercise_version_choices.find(
    (choice) => choice.version_number === versionNumber,
  );
  return match?.exercise_version_id ?? null;
}
