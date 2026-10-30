import { describe, expect, it } from "vitest";
import { formatExerciseParams } from "../src/domain/format-exercise-params.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../src/domain/global-type-defaults-seed.js";
import {
  type MyDefaultsPendingCopySlots,
  myDefaultsPendingCopySlots,
} from "../src/ui/copy/my-defaults-pending-copy.js";

const FIXTURE_PER_DAY_RANGE = "fixture-per-day-range-slot";
const FIXTURE_N_SETS = "fixture-n-sets-slot";

function copyWithFixture(
  overrides: Partial<MyDefaultsPendingCopySlots>,
): MyDefaultsPendingCopySlots {
  return { ...myDefaultsPendingCopySlots, ...overrides };
}

describe("formatExerciseParams (unit)", () => {
  it("renders per-day range readout when the slot is set", () => {
    const copy = copyWithFixture({
      readoutPerDayRange: () => FIXTURE_PER_DAY_RANGE,
    });
    expect(formatExerciseParams(GLOBAL_TYPE_DEFAULTS_SEED.stretching, copy)).toContain(
      FIXTURE_PER_DAY_RANGE,
    );
  });

  it("omits per-day range readout when the slot is undefined", () => {
    expect(formatExerciseParams(GLOBAL_TYPE_DEFAULTS_SEED.stretching)).toBe(
      "30s hold, every day",
    );
  });

  it("renders sets readout when the n-sets slot is set", () => {
    const copy = copyWithFixture({
      readoutNSets: () => FIXTURE_N_SETS,
    });
    expect(formatExerciseParams(GLOBAL_TYPE_DEFAULTS_SEED.concentric, copy)).toContain(
      FIXTURE_N_SETS,
    );
  });

  it("omits sets readout when the n-sets slot is undefined", () => {
    expect(formatExerciseParams(GLOBAL_TYPE_DEFAULTS_SEED.concentric)).toBe(
      "10 reps, 2s hold, 3x a week",
    );
  });

  it("omits scalar per_day readouts when slots are undefined", () => {
    expect(formatExerciseParams({ per_day: 1 })).toBe("");
    expect(formatExerciseParams({ per_day: 2 })).toBe("");
    expect(formatExerciseParams({ per_day: 3 })).toBe("");
  });

  it("renders scalar per_day when once-a-day slot is set", () => {
    const copy = copyWithFixture({ readoutOnceADay: "fixture-once-a-day" });
    expect(formatExerciseParams({ per_day: 1 }, copy)).toBe("fixture-once-a-day");
  });
});
