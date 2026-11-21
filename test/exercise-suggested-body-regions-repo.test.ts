import { describe, expect, it } from "vitest";
import { ExerciseSuggestedBodyRegionsRepository } from "../src/storage/repositories/exercise-data.js";
import { FreeTextValidationError } from "../src/domain/exercise-free-text.js";
import { id } from "./helpers/opaque-test-ids.js";

describe("ExerciseSuggestedBodyRegionsRepository", () => {
  it("rejects patient details when building suggestion insert statements", () => {
    const repo = new ExerciseSuggestedBodyRegionsRepository();
    expect(() =>
      repo.buildInsertSuggestionBatchStatement(id("ex-pii"), "call Jane 416-555-0199"),
    ).toThrow(FreeTextValidationError);
  });

  it("stores normalizeConditionLabelKey output in insert bindings", () => {
    const repo = new ExerciseSuggestedBodyRegionsRepository();
    const stmt = repo.buildInsertSuggestionBatchStatement(
      id("ex-suggest"),
      "Upper   back",
    );
    expect(stmt.bindings?.[1]).toBe("upper back");
  });
});
