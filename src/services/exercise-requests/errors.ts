export type ExerciseRequestsServiceErrorCode =
  | "practitioner_not_found"
  | "request_not_found"
  | "invalid_input"
  | "draft_not_ready"
  | "conflict_target_not_found"
  | "merge_target_not_ready"
  | "approve_failed"
  | "alias_conflict";

export class ExerciseRequestsServiceError extends Error {
  constructor(
    message: string,
    readonly code: ExerciseRequestsServiceErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ExerciseRequestsServiceError";
  }
}

export function isExerciseAliasUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message;
  return (
    message.includes("idx_exercise_aliases_alias") ||
    message.includes("UNIQUE constraint failed: exercise_aliases") ||
    message.includes("UNIQUE constraint failed: idx_exercise_aliases_alias")
  );
}
