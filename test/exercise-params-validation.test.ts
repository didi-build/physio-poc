import { describe, expect, it } from "vitest";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../src/domain/global-type-defaults-seed.js";
import {
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
import { id } from "./helpers/opaque-test-ids.js";

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

  it("rejects param_overrides when a nested value is out of bounds", () => {
    expect(() =>
      validateParamOverridesByType({
        eccentric: { descent_s: 11 },
      }),
    ).toThrow(ParamValidationError);
    expect(() =>
      validateParamOverridesByType({
        stretching: { per_day: { min: 0, max: 2 } },
      }),
    ).toThrow(ParamValidationError);
  });

  it("parseExerciseParamsJson throws on invalid JSON instead of returning {}", () => {
    expect(() => parseExerciseParamsJson("{")).toThrow(ParamValidationError);
  });
});

describe("PARAM_VALUE_BOUNDS pinned to programModel PARAM_META", () => {
  it("matches design/reference/web-app/generated/programModel.ts lines 23 to 31", () => {
    expect(PARAM_VALUE_BOUNDS).toEqual({
      reps: { min: 1, max: 50, integer: true },
      sets: { min: 1, max: 10, integer: true },
      hold_s: { min: 1, max: 120, integer: true },
      ascent_s: { min: 1, max: 10, integer: true },
      descent_s: { min: 1, max: 10, integer: true },
      rest_s: { min: 10, max: 300, integer: true },
      per_day: { min: 1, max: 5, integer: true },
      days_per_week: { min: 1, max: 7, integer: true },
    });
  });
});

describe("global type defaults seed stays within param bounds", () => {
  it("validates every seeded param map", () => {
    for (const params of Object.values(GLOBAL_TYPE_DEFAULTS_SEED)) {
      expect(validateExerciseParams(params)).toEqual(params);
    }
  });
});

describe("param bounds edges (hard-coded, programModel PARAM_META)", () => {
  it("reps accepts 1 and 50, rejects 0 and 51", () => {
    expect(validateExerciseParams({ reps: 1 })).toEqual({ reps: 1 });
    expect(validateExerciseParams({ reps: 50 })).toEqual({ reps: 50 });
    expect(() => validateExerciseParams({ reps: 0 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ reps: 51 })).toThrow(ParamValidationError);
  });

  it("sets accepts 1 and 10, rejects 0 and 11", () => {
    expect(validateExerciseParams({ sets: 1 })).toEqual({ sets: 1 });
    expect(validateExerciseParams({ sets: 10 })).toEqual({ sets: 10 });
    expect(() => validateExerciseParams({ sets: 0 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ sets: 11 })).toThrow(ParamValidationError);
  });

  it("hold_s accepts 1 and 120, rejects 0 and 121", () => {
    expect(validateExerciseParams({ hold_s: 1 })).toEqual({ hold_s: 1 });
    expect(validateExerciseParams({ hold_s: 120 })).toEqual({ hold_s: 120 });
    expect(() => validateExerciseParams({ hold_s: 0 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ hold_s: 121 })).toThrow(ParamValidationError);
  });

  it("ascent_s accepts 1 and 10, rejects 0 and 11", () => {
    expect(validateExerciseParams({ ascent_s: 1 })).toEqual({ ascent_s: 1 });
    expect(validateExerciseParams({ ascent_s: 10 })).toEqual({ ascent_s: 10 });
    expect(() => validateExerciseParams({ ascent_s: 0 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ ascent_s: 11 })).toThrow(
      ParamValidationError,
    );
  });

  it("descent_s accepts 1 and 10, rejects 0 and 11", () => {
    expect(validateExerciseParams({ descent_s: 1 })).toEqual({ descent_s: 1 });
    expect(validateExerciseParams({ descent_s: 10 })).toEqual({ descent_s: 10 });
    expect(() => validateExerciseParams({ descent_s: 0 })).toThrow(
      ParamValidationError,
    );
    expect(() => validateExerciseParams({ descent_s: 11 })).toThrow(
      ParamValidationError,
    );
  });

  it("rest_s accepts 10 and 300, rejects 9 and 301", () => {
    expect(validateExerciseParams({ rest_s: 10 })).toEqual({ rest_s: 10 });
    expect(validateExerciseParams({ rest_s: 300 })).toEqual({ rest_s: 300 });
    expect(() => validateExerciseParams({ rest_s: 9 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ rest_s: 301 })).toThrow(ParamValidationError);
  });

  it("per_day scalar accepts 1 and 5, rejects 0 and 6", () => {
    expect(validateExerciseParams({ per_day: 1 })).toEqual({ per_day: 1 });
    expect(validateExerciseParams({ per_day: 5 })).toEqual({ per_day: 5 });
    expect(() => validateExerciseParams({ per_day: 0 })).toThrow(ParamValidationError);
    expect(() => validateExerciseParams({ per_day: 6 })).toThrow(ParamValidationError);
  });

  it("per_day range accepts edges 1 to 5 and rejects out-of-range endpoints", () => {
    expect(validateExerciseParams({ per_day: { min: 1, max: 5 } })).toEqual({
      per_day: { min: 1, max: 5 },
    });
    expect(() => validateExerciseParams({ per_day: { min: 0, max: 5 } })).toThrow(
      ParamValidationError,
    );
    expect(() => validateExerciseParams({ per_day: { min: 1, max: 6 } })).toThrow(
      ParamValidationError,
    );
  });

  it("days_per_week accepts 1 and 7, rejects 0 and 8", () => {
    expect(validateExerciseParams({ days_per_week: 1 })).toEqual({ days_per_week: 1 });
    expect(validateExerciseParams({ days_per_week: 7 })).toEqual({ days_per_week: 7 });
    expect(() => validateExerciseParams({ days_per_week: 0 })).toThrow(
      ParamValidationError,
    );
    expect(() => validateExerciseParams({ days_per_week: 8 })).toThrow(
      ParamValidationError,
    );
  });
});

describe("param bounds reject fractions (hard-coded)", () => {
  it("reps rejects 1.5", () => {
    expect(() => validateExerciseParams({ reps: 1.5 })).toThrow(ParamValidationError);
  });

  it("sets rejects 1.5", () => {
    expect(() => validateExerciseParams({ sets: 1.5 })).toThrow(ParamValidationError);
  });

  it("hold_s rejects 1.5", () => {
    expect(() => validateExerciseParams({ hold_s: 1.5 })).toThrow(ParamValidationError);
  });

  it("ascent_s rejects 1.5", () => {
    expect(() => validateExerciseParams({ ascent_s: 1.5 })).toThrow(
      ParamValidationError,
    );
  });

  it("descent_s rejects 1.5", () => {
    expect(() => validateExerciseParams({ descent_s: 1.5 })).toThrow(
      ParamValidationError,
    );
  });

  it("rest_s rejects 10.5", () => {
    expect(() => validateExerciseParams({ rest_s: 10.5 })).toThrow(
      ParamValidationError,
    );
  });

  it("per_day scalar rejects 1.5", () => {
    expect(() => validateExerciseParams({ per_day: 1.5 })).toThrow(
      ParamValidationError,
    );
  });

  it("per_day range rejects fractional min and max", () => {
    expect(() => validateExerciseParams({ per_day: { min: 1.5, max: 3 } })).toThrow(
      ParamValidationError,
    );
    expect(() => validateExerciseParams({ per_day: { min: 1, max: 2.5 } })).toThrow(
      ParamValidationError,
    );
  });

  it("days_per_week rejects 1.5", () => {
    expect(() => validateExerciseParams({ days_per_week: 1.5 })).toThrow(
      ParamValidationError,
    );
  });
});

describe("text override validation (unit)", () => {
  it("accepts known text fields and rejects unknown keys", () => {
    expect(
      validateTextOverrides({
        title: { value: "My title", base: "Library title" },
      }),
    ).toEqual({
      title: { value: "My title", base: "Library title" },
    });
    expect(() => validateTextOverrides({ patient_name: "x" })).toThrow(
      TextOverrideValidationError,
    );
  });

  it("rejects non-object field entries", () => {
    expect(() => validateTextOverrides({ title: 42 } as unknown as never)).toThrow(
      TextOverrideValidationError,
    );
  });

  it("trims title value, enforces length, and rejects patient details", () => {
    expect(
      validateTextOverrides({
        title: { value: "  Heel slide  ", base: "Heel slide" },
      }),
    ).toEqual({
      title: { value: "Heel slide", base: "Heel slide" },
    });
    expect(() =>
      validateTextOverrides({
        title: { value: "a".repeat(81), base: "Heel slide" },
      }),
    ).toThrow(TextOverrideValidationError);
    expect(() =>
      validateTextOverrides({
        title: { value: "Reach patient@example.com", base: "Heel slide" },
      }),
    ).toThrow(TextOverrideValidationError);
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
          id: id("req-bad-note"),
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
