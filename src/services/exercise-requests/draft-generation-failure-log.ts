import { DeepInfraExerciseDraftError } from "./deepinfra-exercise-draft-error.js";
import { ExerciseRequestsServiceError } from "./errors.js";
import { ImageGenerationError } from "../../storage/ports/image-generation.js";

export const DRAFT_GENERATION_FAILED_EVENT = "physio_draft_generation_failed";

export type DraftGenerationFailurePhase = "text" | "images" | "persist";

export function logDraftGenerationFailed(input: {
  requestId: string;
  phase: DraftGenerationFailurePhase;
  error: unknown;
  httpStatus?: number;
  durationMs?: number;
}): void {
  const err = input.error;
  const errorName = err instanceof Error ? err.name : "Error";
  let errorCode: string | null = null;
  if (err instanceof ExerciseRequestsServiceError) {
    errorCode = err.code;
  } else if (err instanceof DeepInfraExerciseDraftError) {
    errorCode = err.code;
  } else if (err instanceof ImageGenerationError) {
    errorCode = err.code;
  }
  console.log(
    JSON.stringify({
      event: DRAFT_GENERATION_FAILED_EVENT,
      request_id: input.requestId,
      phase: input.phase,
      error_name: errorName,
      error_code: errorCode,
      http_status: input.httpStatus ?? 502,
      duration_ms: input.durationMs ?? null,
    }),
  );
}
