export type DeepInfraExerciseDraftErrorCode =
  | "deepinfra_exercise_draft_request_failed"
  | "deepinfra_exercise_draft_response_invalid"
  | "deepinfra_exercise_draft_response_too_large"
  | "deepinfra_exercise_draft_timeout"
  | "deepinfra_exercise_draft_network_error"
  | "deepinfra_exercise_draft_body_region_invalid";

export class DeepInfraExerciseDraftError extends Error {
  readonly httpStatus?: number;

  constructor(
    readonly code: DeepInfraExerciseDraftErrorCode,
    options?: ErrorOptions & { httpStatus?: number },
  ) {
    super(code, options);
    this.name = "DeepInfraExerciseDraftError";
    this.httpStatus = options?.httpStatus;
  }
}
