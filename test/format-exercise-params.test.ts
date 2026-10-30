import { describe, expect, it } from "vitest";
import { formatExerciseParams } from "../src/domain/format-exercise-params.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../src/domain/global-type-defaults-seed.js";

describe("formatExerciseParams (unit)", () => {
  it("formats global stretching defaults like the approved mockup", () => {
    expect(formatExerciseParams(GLOBAL_TYPE_DEFAULTS_SEED.stretching)).toBe(
      "30s hold, 1 to 3 times a day, every day",
    );
  });

  it("formats concentric defaults with reps and weekly frequency", () => {
    expect(formatExerciseParams(GLOBAL_TYPE_DEFAULTS_SEED.concentric)).toBe(
      "10 reps, 2s hold, 3 sets, 3x a week",
    );
  });

  it("omits sets readout when sets is 1", () => {
    expect(
      formatExerciseParams({ reps: 1, sets: 1, hold_s: 10, days_per_week: 7 }),
    ).toBe("1 rep, 10s hold, every day");
  });
});
