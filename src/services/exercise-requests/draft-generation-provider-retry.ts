import { DeepInfraExerciseDraftError } from "./deepinfra-exercise-draft-error.js";
import { ImageGenerationError } from "../../storage/ports/image-generation.js";

export function isRetryableDeepInfraExerciseDraftError(
  error: DeepInfraExerciseDraftError,
): boolean {
  switch (error.code) {
    case "deepinfra_exercise_draft_timeout":
    case "deepinfra_exercise_draft_network_error":
      return true;
    case "deepinfra_exercise_draft_request_failed": {
      const status = error.httpStatus;
      if (status === undefined) {
        return true;
      }
      if (status === 429 || status >= 500) {
        return true;
      }
      return false;
    }
    case "deepinfra_exercise_draft_response_invalid":
      return true;
    case "deepinfra_exercise_draft_response_too_large":
      return false;
    default:
      return false;
  }
}

export function isRetryableImageGenerationError(error: ImageGenerationError): boolean {
  if (error.code === "image_generation_network_failed") {
    return true;
  }
  if (error.code === "image_generation_request_failed") {
    const status = error.statusCode;
    return status === 429 || status >= 500;
  }
  return false;
}
