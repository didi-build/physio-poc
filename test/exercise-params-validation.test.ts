import { describe, expect, it } from "vitest";
import {
  PARAM_KEYS,
  PARAM_VALUE_BOUNDS,
  ParamValidationError,
  parseExerciseParamsJson,
  validateExerciseParams,
  validateParamOverridesByType,
} from "../src/domain/exercise-params.js";
import {
  FreeTextValidationError,
  validateRequestedExerciseName,
} from "../src/domain/exercise-free-text.js";
import {
  TextOverrideValidationError,
  validateTextOverrides,
} from "../src/domain/exercise-text-overrides.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import {
  openMigratedDatabase,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";

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

  it("validates per_day ranges and rejects extra range keys", () => {
    expect(validateExerciseParams({ per_day: { min: 1, max: 3 } })).toEqual({
      per_day: { min: 1, max: 3 },
    });
    expect(() => validateExerciseParams({ per_day: { min: 3, max: 1 } })).toThrow(
      ParamValidationError,
    );
    expect(() =>
      validateExerciseParams({ per_day: { min: 1, max: 2, extra: 3 } }),
    ).toThrow(ParamValidationError);
  });

  it("rejects non-integer and out-of-range integer params", () => {
    expect(() => validateExerciseParams({ sets: 2.5 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ reps: 0 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ days_per_week: 8 })).toThrow(
      ParamValidationError,
    );
    expect(() => validateExerciseParams({ hold_s: 0 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ rest_s: 9 })).toThrow(ParamValidationError);
  });

  it("rejects values above approved UI max bounds", () => {
    expect(() => validateExerciseParams({ reps: 51 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ sets: 11 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ hold_s: 121 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ per_day: 6 })).toThrow(ParamValidationError);
  });

  it("rejects range objects on non-per_day keys", () => {
    expect(() => validateExerciseParams({ hold_s: { min: 1, max: 2 } })).toThrow(
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

  it("parseExerciseParamsJson throws on invalid JSON instead of returning {}", () => {
    expect(() => parseExerciseParamsJson("{")).toThrow(ParamValidationError);
  });
});

describe("param value bounds (unit, approved UI ranges)", () => {
  it.each(PARAM_KEYS)("%s accepts min and max inclusive edges", (key) => {
    const bounds = PARAM_VALUE_BOUNDS[key];
    if (key === "per_day") {
      expect(validateExerciseParams({ per_day: bounds.min })).toEqual({
        per_day: bounds.min,
      });
      expect(validateExerciseParams({ per_day: bounds.max })).toEqual({
        per_day: bounds.max,
      });
      expect(
        validateExerciseParams({ per_day: { min: bounds.min, max: bounds.max } }),
      ).toEqual({ per_day: { min: bounds.min, max: bounds.max } });
      return;
    }
    expect(validateExerciseParams({ [key]: bounds.min })).toEqual({
      [key]: bounds.min,
    });
    expect(validateExerciseParams({ [key]: bounds.max })).toEqual({
      [key]: bounds.max,
    });
  });

  it.each(PARAM_KEYS)("%s rejects one below min and one above max", (key) => {
    const bounds = PARAM_VALUE_BOUNDS[key];
    const below = bounds.min - 1;
    const above = bounds.max + 1;
    if (key === "per_day") {
      expect(() => validateExerciseParams({ per_day: below })).toThrow(
        ParamValidationError,
      );
      expect(() => validateExerciseParams({ per_day: above })).toThrow(
        ParamValidationError,
      );
      expect(() =>
        validateExerciseParams({ per_day: { min: below, max: bounds.max } }),
      ).toThrow(ParamValidationError);
      expect(() =>
        validateExerciseParams({ per_day: { min: bounds.min, max: above } }),
      ).toThrow(ParamValidationError);
      return;
    }
    expect(() => validateExerciseParams({ [key]: below })).toThrow(
      ParamValidationError,
    );
    expect(() => validateExerciseParams({ [key]: above })).toThrow(
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

  it("rejects non-string override values", () => {
    expect(() => validateTextOverrides({ title: 42 } as unknown as never)).toThrow(
      TextOverrideValidationError,
    );
  });

  it("trims title, enforces length, and rejects patient details", () => {
    expect(validateTextOverrides({ title: "  Heel slide  " })).toEqual({
      title: "Heel slide",
    });
    expect(() => validateTextOverrides({ title: "a".repeat(81) })).toThrow(
      TextOverrideValidationError,
    );
    expect(() => validateTextOverrides({ title: "Reach patient@example.com" })).toThrow(
      TextOverrideValidationError,
    );
  });
});

describe("repository write validation (integration, SQLite)", () => {
  it("upsertPractitionerDefaults validates params before write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const repo = new TypeDefaultsRepository(storage);
      await expect(
        repo.upsertPractitionerDefaults("td-p1", practId, "isometric", {
          sets: 2.5,
        }),
      ).rejects.toThrow(ParamValidationError);
    } finally {
      storage.close();
    }
  });

  it("exercise_requests repository enforces note and requested_name limits and patient-detail guard", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const repo = new ExerciseRequestsRepository(storage);
      await expect(
        repo.insert({
          id: "req-bad-note",
          requestedName: "Heel slide",
          note: "a".repeat(301),
          requestedBy: practId,
          status: "open",
          createdAt: TS,
          updatedAt: TS,
        }),
      ).rejects.toThrow(FreeTextValidationError);

      expect(() => validateRequestedExerciseName("a".repeat(101))).toThrow(
        FreeTextValidationError,
      );
    } finally {
      storage.close();
    }
  });
});
