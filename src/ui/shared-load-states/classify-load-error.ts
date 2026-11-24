import { ExerciseMediaRequestError } from "../api/exercise-media-client.js";
import { ExerciseRequestsRequestError } from "../api/exercise-requests-client.js";
import { HttpResponseError } from "../api/http-response-error.js";

/** Distinguish missing resource from transport/load failure (spec not-found vs item error). */

const NOT_FOUND_MESSAGE_MARKERS = [
  "exercise not found",
  "request not found",
  "routine not found",
  "program not found",
] as const;

export function isLoadNotFoundError(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }
  if (error instanceof HttpResponseError) {
    if (error.status === 404) {
      return true;
    }
    const code = error.code?.toLowerCase() ?? "";
    if (code.endsWith("_not_found") || code === "not_found") {
      return true;
    }
  }
  if (
    error instanceof ExerciseRequestsRequestError ||
    error instanceof ExerciseMediaRequestError
  ) {
    if (error.detail.status === 404) {
      return true;
    }
    const code = error.detail.error?.toLowerCase() ?? "";
    if (code.endsWith("_not_found") || code === "not_found") {
      return true;
    }
  }
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code).toLowerCase()
      : "";
  if (code.endsWith("_not_found") || code === "not_found") {
    return true;
  }
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : NaN;
  if (status === 404) {
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.endsWith("_not_found") || message === "not_found") {
      return true;
    }
    if (NOT_FOUND_MESSAGE_MARKERS.some((marker) => message === marker)) {
      return true;
    }
  }
  return false;
}
