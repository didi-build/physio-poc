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
