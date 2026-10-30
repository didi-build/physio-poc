/** Empty until DIDI-1130 / DIDI-1131 (dose field labels). Do not invent interim user-facing text. */

export type ProgramsPendingCopySlots = {
  listLoadErrorMessage: string | undefined;
  builderLoadErrorMessage: string | undefined;
  listLoadingMessage: string | undefined;
  builderLoadingMessage: string | undefined;
  cardSentDateLine: ((date: string) => string) | undefined;
  cardLinkStatusLine: string | undefined;
  doseParamLabels: Partial<
    Record<import("../../domain/exercise-params.js").ParamKey, string | undefined>
  >;
};

export const programsPendingCopySlots: ProgramsPendingCopySlots = {
  listLoadErrorMessage: undefined,
  builderLoadErrorMessage: undefined,
  listLoadingMessage: undefined,
  builderLoadingMessage: undefined,
  cardSentDateLine: undefined,
  cardLinkStatusLine: undefined,
  doseParamLabels: {},
};
