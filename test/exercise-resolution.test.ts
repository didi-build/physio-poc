import { describe, expect, it } from "vitest";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../src/domain/global-type-defaults-seed.js";
import { resolveExerciseParams } from "../src/domain/resolve-exercise-params.js";
import {
  resolveTextField,
  type LibraryVersionText,
} from "../src/domain/exercise-text-overrides.js";

describe("resolveExerciseParams (unit)", () => {
  it("uses global defaults when no overrides exist", () => {
    const resolved = resolveExerciseParams({
      prescriptionType: "stretching",
      paramOverrides: {},
      practitionerTypeDefaults: {},
    });
    expect(resolved.source).toBe("global_defaults");
    expect(resolved.params).toEqual(GLOBAL_TYPE_DEFAULTS_SEED.stretching);
  });

  it("applies practitioner type defaults on top of global", () => {
    const resolved = resolveExerciseParams({
      prescriptionType: "isometric",
      paramOverrides: {},
      practitionerTypeDefaults: { hold_s: 20 },
    });
    expect(resolved.source).toBe("practitioner_defaults");
    expect(resolved.params).toEqual({
      ...GLOBAL_TYPE_DEFAULTS_SEED.isometric,
      hold_s: 20,
    });
  });

  it("prefers my exercise param override over practitioner and global", () => {
    const resolved = resolveExerciseParams({
      prescriptionType: "stretching",
      paramOverrides: { stretching: { hold_s: 45, per_day: { min: 2, max: 2 } } },
      practitionerTypeDefaults: { hold_s: 20 },
    });
    expect(resolved.source).toBe("exercise_override");
    expect(resolved.params.hold_s).toBe(45);
    expect(resolved.params.per_day).toEqual({ min: 2, max: 2 });
    expect(resolved.params.days_per_week).toBe(7);
  });
});

describe("resolveTextField (unit)", () => {
  const version: LibraryVersionText = {
    title: "Library title",
    description: "Library description",
    cue_stretching: "Library stretch cue",
    cue_isometric: null,
    cue_concentric: null,
    cue_eccentric: null,
  };

  it("returns library text when no override", () => {
    expect(resolveTextField({}, version, "title", "stretching")).toBe("Library title");
    expect(resolveTextField({}, version, "cue", "stretching")).toBe(
      "Library stretch cue",
    );
  });

  it("returns override text when present", () => {
    expect(
      resolveTextField(
        {
          title: { value: "My title", base: "Library title" },
          cue_stretching: { value: "My cue", base: "Library stretch cue" },
        },
        version,
        "title",
        "stretching",
      ),
    ).toBe("My title");
    expect(
      resolveTextField(
        { cue_stretching: { value: "My cue", base: "Library stretch cue" } },
        version,
        "cue",
        "stretching",
      ),
    ).toBe("My cue");
  });
});
