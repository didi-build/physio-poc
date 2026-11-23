/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { describe, expect, it } from "vitest";
import { draftReviewGenerationEscape } from "../../src/ui/exercise-requests/draft-review-generation-visibility.js";
import { DRAFT_GENERATION_UI_ESCAPE_MS } from "../../src/services/exercise-requests/draft-generation-constants.js";

const PIN_ESCAPE_MS = 180_000;

describe("DIDI-1289 draft review stale generation escape", () => {
  it("pins escape threshold at 180000 ms", () => {
    expect(DRAFT_GENERATION_UI_ESCAPE_MS).toBe(PIN_ESCAPE_MS);
  });

  it("enables escape before threshold only after 180000 ms", () => {
    const lockAt = "2026-11-23T12:00:00.000Z";
    const beforeMs = Date.parse(lockAt) + PIN_ESCAPE_MS - 1;
    const atMs = Date.parse(lockAt) + PIN_ESCAPE_MS;
    expect(
      draftReviewGenerationEscape({
        firstDraftComplete: false,
        generationInProgress: true,
        ownGenerateInFlight: false,
        draftGenerationLockedAt: lockAt,
        nowMs: beforeMs,
      }),
    ).toBe(false);
    expect(
      draftReviewGenerationEscape({
        firstDraftComplete: false,
        generationInProgress: true,
        ownGenerateInFlight: false,
        draftGenerationLockedAt: lockAt,
        nowMs: atMs,
      }),
    ).toBe(true);
  });

  it("hides escape while own /generate is in flight", () => {
    expect(
      draftReviewGenerationEscape({
        firstDraftComplete: false,
        generationInProgress: false,
        ownGenerateInFlight: true,
        draftGenerationLockedAt: null,
        nowMs: Date.now(),
      }),
    ).toBe(false);
  });

  it("enables escape when the lock is stale or absent and own generate is idle", () => {
    expect(
      draftReviewGenerationEscape({
        firstDraftComplete: false,
        generationInProgress: false,
        ownGenerateInFlight: false,
        draftGenerationLockedAt: null,
        nowMs: Date.now(),
      }),
    ).toBe(true);
  });

  it("enables escape when generation started elsewhere but is no longer in progress", () => {
    const lockAt = "2026-11-23T12:00:00.000Z";
    expect(
      draftReviewGenerationEscape({
        firstDraftComplete: false,
        generationInProgress: false,
        ownGenerateInFlight: false,
        draftGenerationLockedAt: lockAt,
        nowMs: Date.parse(lockAt) + 1000,
      }),
    ).toBe(true);
  });
});
