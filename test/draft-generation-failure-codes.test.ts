import { describe, expect, it } from "vitest";
import {
  failureCodeToPhase,
  terminalOutcomeToFailureCode,
} from "../src/services/exercise-requests/draft-generation-failure-codes.js";

describe("draft generation failure codes (N17/N22)", () => {
  it("maps daily_limit terminal to daily_limit_reached and daily phase", () => {
    expect(terminalOutcomeToFailureCode("daily_limit")).toBe("daily_limit_reached");
    expect(failureCodeToPhase("daily_limit_reached")).toBe("daily");
  });

  it("maps images_failed to images phase, not daily", () => {
    expect(failureCodeToPhase("images_failed")).toBe("images");
    expect(failureCodeToPhase("daily_limit_reached")).not.toBe("images");
  });
});
