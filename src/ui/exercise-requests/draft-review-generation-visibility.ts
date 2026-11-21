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
