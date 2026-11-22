/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { describe, expect, it } from "vitest";
import { draftReviewStaleGenerationEscape } from "../../src/ui/exercise-requests/draft-review-generation-visibility.js";
import { DRAFT_GENERATION_UI_ESCAPE_MS } from "../../src/services/exercise-requests/draft-generation-constants.js";

const PIN_ESCAPE_MS = 180_000;

describe("DIDI-1289 draft review stale generation escape", () => {
  it("pins escape threshold at 180000 ms", () => {
    expect(DRAFT_GENERATION_UI_ESCAPE_MS).toBe(PIN_ESCAPE_MS);
  });

  it("enables escape before threshold only after 180000 ms", () => {
    const start = 1_000_000;
    expect(
      draftReviewStaleGenerationEscape({
        firstDraftComplete: false,
        generationInProgress: true,
        ownGenerateInFlight: false,
        waitStartedAt: start,
        nowMs: start + PIN_ESCAPE_MS - 1,
      }),
    ).toBe(false);
    expect(
      draftReviewStaleGenerationEscape({
        firstDraftComplete: false,
        generationInProgress: true,
        ownGenerateInFlight: false,
        waitStartedAt: start,
        nowMs: start + PIN_ESCAPE_MS,
      }),
    ).toBe(true);
  });
});
