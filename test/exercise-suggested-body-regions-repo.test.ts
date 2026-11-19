import { describe, expect, it } from "vitest";
import { ExerciseSuggestedBodyRegionsRepository } from "../src/storage/repositories/exercise-data.js";
import { id } from "./helpers/opaque-test-ids.js";

describe("ExerciseSuggestedBodyRegionsRepository", () => {
  it("stores normalizeConditionLabelKey output in insert bindings", () => {
    const repo = new ExerciseSuggestedBodyRegionsRepository();
    const stmt = repo.buildInsertSuggestionBatchStatement(
      id("ex-suggest"),
      "Upper   back",
    );
    expect(stmt.bindings?.[1]).toBe("upper back");
  });
});
