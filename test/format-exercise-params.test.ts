import { describe, expect, it } from "vitest";
import type { ExerciseParams } from "../src/domain/exercise-params.js";
import { formatExerciseParams } from "../src/domain/format-exercise-params.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../src/domain/global-type-defaults-seed.js";

const PENDING_SLOT_FIXTURE_PARAMS: ExerciseParams = {
  reps: 10,
  hold_s: 2,
  sets: 1,
  per_day: 2,
  ascent_s: 3,
  days_per_week: 3,
};

function expectExactReadoutWithPendingSlotsUnset(
  params: ExerciseParams,
  expected: string,
): void {
  const readout = formatExerciseParams(params);
  expect(readout).toBe(expected);
  expect(readout).not.toMatch(/undefined/);
}

describe("formatExerciseParams (unit)", () => {
  it("omits pending-slot segments with exact readout (sets 1 and ascent_s present)", () => {
    expectExactReadoutWithPendingSlotsUnset(
      PENDING_SLOT_FIXTURE_PARAMS,
      "10 reps, 2s hold, 3x a week",
    );
  });

  it("omits per-day range readout when the slot is undefined", () => {
    expectExactReadoutWithPendingSlotsUnset(
      GLOBAL_TYPE_DEFAULTS_SEED.stretching,
      "30s hold, every day",
    );
  });

  it("omits plural sets readout when the n-sets slot is undefined", () => {
    expectExactReadoutWithPendingSlotsUnset(
      GLOBAL_TYPE_DEFAULTS_SEED.concentric,
      "10 reps, 2s hold, 3x a week",
    );
  });

  it("omits scalar per_day readouts when slots are undefined", () => {
    expectExactReadoutWithPendingSlotsUnset({ per_day: 1 }, "");
    expectExactReadoutWithPendingSlotsUnset({ per_day: 2 }, "");
    expectExactReadoutWithPendingSlotsUnset({ per_day: 3 }, "");
  });
});
