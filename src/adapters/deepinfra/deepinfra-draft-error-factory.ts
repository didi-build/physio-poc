import {
  DeepInfraExerciseDraftError,
  type DeepInfraExerciseDraftErrorCode,
} from "../../services/exercise-requests/deepinfra-exercise-draft-error.js";

/** DeepInfra errors are code-only at the surface; never attach raw causes that may echo secrets. */
export function deepInfraExerciseDraftError(
  code: DeepInfraExerciseDraftErrorCode,
  options?: { httpStatus?: number },
): DeepInfraExerciseDraftError {
  return new DeepInfraExerciseDraftError(code, {
    httpStatus: options?.httpStatus,
  });
}
