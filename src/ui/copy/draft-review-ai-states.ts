/** Verbatim strings from design/app/draft-review-ai-states/spec.md (G1–G10, reused locks). */

export const DRAFT_AI_TEXT_FAILURE = "The AI couldn't write the text.";
export const DRAFT_AI_IMAGE_FAILURE =
  "The AI couldn't make the images. The text is kept.";
export const DRAFT_AI_LIMIT_TRY_TOMORROW = "You can try again tomorrow.";
export const DRAFT_REGEN_TEXT_ONLY_LABEL = "Text only";
export const DRAFT_REGEN_TEXT_ONLY_HINT = "All the written fields. Images stay.";
export const DRAFT_REGENERATE_TEXT = "Regenerate text";
export const DRAFT_REGENERATING_TEXT =
  "Regenerating the text. Everything else stays usable.";
export const DRAFT_GENERATION_STARTED_ELSEWHERE =
  "Already started. This page updates when the draft is ready.";
export const DRAFT_REGEN_SCOPE_ALL_LABEL = "Text and images";
export const DRAFT_REGEN_SCOPE_IMAGES_HINT = "Start and end images. Text stays.";
