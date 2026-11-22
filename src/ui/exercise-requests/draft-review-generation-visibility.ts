import { DRAFT_GENERATION_UI_ESCAPE_MS } from "../../services/exercise-requests/draft-generation-constants.js";

export function draftReviewStaleGenerationEscape(input: {
  firstDraftComplete: boolean;
  generationInProgress: boolean;
  ownGenerateInFlight: boolean;
  waitStartedAt: number | null;
  nowMs: number;
}): boolean {
  return (
    !input.firstDraftComplete &&
    (input.generationInProgress || input.ownGenerateInFlight) &&
    input.waitStartedAt !== null &&
    input.nowMs - input.waitStartedAt >= DRAFT_GENERATION_UI_ESCAPE_MS
  );
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
