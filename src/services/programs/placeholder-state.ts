import type { ExerciseRequestStatus } from "../../domain/exercise-types.js";

export type PlaceholderState = "awaiting_approval" | "type_mismatch" | "request_closed";

/**
 * Derived at read time for placeholder rows from the linked exercise request status.
 * Approved placeholders are always type_mismatch (the only skip path leaves them unlinked).
 */
export function derivePlaceholderState(
  requestStatus: ExerciseRequestStatus,
): PlaceholderState {
  if (requestStatus === "drafting" || requestStatus === "open") {
    return "awaiting_approval";
  }
  if (requestStatus === "withdrawn") {
    return "request_closed";
  }
  if (requestStatus === "approved") {
    return "type_mismatch";
  }
  return "awaiting_approval";
}
