import { DRAFT_GENERATION_UI_ESCAPE_MS } from "../../services/exercise-requests/draft-generation-constants.js";

export { DRAFT_GENERATION_UI_ESCAPE_MS };

export function draftReviewGenerationEscape(input: {
  firstDraftComplete: boolean;
  generationInProgress: boolean;
  draftGenerationLockedAt: string | null;
  nowMs: number;
}): boolean {
  if (input.firstDraftComplete) {
    return false;
  }
  if (!input.generationInProgress) {
    return true;
  }
  if (!input.draftGenerationLockedAt) {
    return true;
  }
  const ageMs = input.nowMs - Date.parse(input.draftGenerationLockedAt);
  return ageMs >= DRAFT_GENERATION_UI_ESCAPE_MS;
}

/** @deprecated use draftReviewGenerationEscape */
export function draftReviewStaleGenerationEscape(input: {
  firstDraftComplete: boolean;
  generationInProgress: boolean;
  ownGenerateInFlight: boolean;
  waitStartedAt: number | null;
  nowMs: number;
}): boolean {
  return draftReviewGenerationEscape({
    firstDraftComplete: input.firstDraftComplete,
    generationInProgress: input.generationInProgress || input.ownGenerateInFlight,
    draftGenerationLockedAt:
      input.waitStartedAt !== null ? new Date(input.waitStartedAt).toISOString() : null,
    nowMs: input.nowMs,
  });
}

/** Whether draft review shows G8 “generation started elsewhere” copy. */
export function showDraftGenerationElsewhere(input: {
  generationStartedElsewhere: boolean;
  isRequester: boolean;
  ownGenerateInFlight: boolean;
  generationInProgress: boolean;
  generationFailure: "text" | "images" | "daily" | null;
}): boolean {
  return (
    (input.generationStartedElsewhere &&
      !(input.isRequester && input.ownGenerateInFlight)) ||
    (!input.isRequester &&
      input.generationInProgress &&
      input.generationFailure === null)
  );
}
