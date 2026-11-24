import type { DraftGenerationFailurePhase } from "./types.js";

export const UNEXPECTED_GENERATION_FAILURE_CODE = "unexpected_generation_failure";

export function failureCodeToPhase(code: string | null): DraftGenerationFailurePhase {
  if (!code) {
    return null;
  }
  if (code === "daily_limit_reached") {
    return "daily";
  }
  if (code === "text_failed" || code === UNEXPECTED_GENERATION_FAILURE_CODE) {
    return "text";
  }
  if (code === "images_failed") {
    return "images";
  }
  return "text";
}

export function terminalOutcomeToFailureCode(
  outcome: "text_failed" | "images_failed" | "daily_limit",
  error?: string,
): string {
  if (outcome === "text_failed") {
    return error ?? UNEXPECTED_GENERATION_FAILURE_CODE;
  }
  if (outcome === "daily_limit") {
    return "daily_limit_reached";
  }
  return "images_failed";
}
