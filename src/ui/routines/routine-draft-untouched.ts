import type { RoutineConditionOption } from "../../services/routines/types.js";

export function isClientDraftUntouched(input: {
  name: string;
  whoItsFor: string;
  conditionId: string | null;
  rowsCount: number;
}): boolean {
  return (
    input.name.trim().length === 0 &&
    input.whoItsFor.trim().length === 0 &&
    input.conditionId === null &&
    input.rowsCount === 0
  );
}

export function conditionIdFromLabel(
  label: string | null,
  options: readonly RoutineConditionOption[],
): string | null {
  if (!label) {
    return null;
  }
  const match = options.find((opt) => opt.label === label);
  return match?.condition_id ?? null;
}
