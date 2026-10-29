import { describe, expect, it } from "vitest";
import {
  ParamValidationError,
  validateExerciseParams,
  validateParamOverridesByType,
} from "../src/domain/exercise-params.js";
import {
  TextOverrideValidationError,
  validateTextOverrides,
} from "../src/domain/exercise-text-overrides.js";

describe("exercise params validation (unit)", () => {
  it("accepts known keys and rejects unknown keys", () => {
    expect(validateExerciseParams({ hold_s: 30, days_per_week: 7 })).toEqual({
      hold_s: 30,
      days_per_week: 7,
    });
    expect(() => validateExerciseParams({ hold: 30 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ unknown_key: 1 })).toThrow(
      ParamValidationError,
    );
  });

  it("validates per_day ranges", () => {
    expect(validateExerciseParams({ per_day: { min: 1, max: 3 } })).toEqual({
      per_day: { min: 1, max: 3 },
    });
    expect(() => validateExerciseParams({ per_day: { min: 3, max: 1 } })).toThrow(
      ParamValidationError,
    );
  });

  it("validates param overrides keyed by prescription type", () => {
    expect(
      validateParamOverridesByType({
        stretching: { hold_s: 45 },
      }),
    ).toEqual({ stretching: { hold_s: 45 } });
    expect(() => validateParamOverridesByType({ bogus: { hold_s: 1 } })).toThrow(
      ParamValidationError,
    );
  });
});

describe("text override validation (unit)", () => {
  it("accepts known text fields and rejects unknown keys", () => {
    expect(validateTextOverrides({ title: "My title" })).toEqual({
      title: "My title",
    });
    expect(() => validateTextOverrides({ patient_name: "x" })).toThrow(
      TextOverrideValidationError,
    );
  });
});
