import { describe, expect, it } from "vitest";
import {
  TextOverrideValidationError,
  validateTextOverrides,
} from "../src/domain/exercise-text-overrides.js";
import { MAX_LENGTH_EXERCISE_TEMPLATE_TEXT } from "../src/mcp-connector/text-limits.js";

describe("text override entry validation (unit)", () => {
  it("accepts value and base objects for known fields", () => {
    expect(
      validateTextOverrides({
        title: { value: "My title", base: "Library title" },
      }),
    ).toEqual({
      title: { value: "My title", base: "Library title" },
    });
  });

  it("rejects unknown top-level field names", () => {
    expect(() =>
      validateTextOverrides({ patient_name: { value: "x", base: "y" } }),
    ).toThrow(TextOverrideValidationError);
  });

  it("rejects unknown keys inside a field object", () => {
    expect(() =>
      validateTextOverrides({
        title: { value: "My title", base: "Library title", extra: "nope" },
      }),
    ).toThrow(TextOverrideValidationError);
  });

  it("rejects non-string value", () => {
    expect(() =>
      validateTextOverrides({
        title: { value: 42, base: "Library title" } as unknown as {
          value: string;
          base: string;
        },
      }),
    ).toThrow(TextOverrideValidationError);
  });

  it("rejects non-string base", () => {
    expect(() =>
      validateTextOverrides({
        title: { value: "My title", base: 42 } as unknown as {
          value: string;
          base: string;
        },
      }),
    ).toThrow(TextOverrideValidationError);
  });

  it("rejects value over the field cap", () => {
    expect(() =>
      validateTextOverrides({
        title: { value: "a".repeat(81), base: "Library title" },
      }),
    ).toThrow(TextOverrideValidationError);
  });

  it("rejects patient details in value", () => {
    expect(() =>
      validateTextOverrides({
        title: { value: "Reach patient@example.com", base: "Library title" },
      }),
    ).toThrow(TextOverrideValidationError);
  });

  it("does not apply title length cap to base", () => {
    expect(
      validateTextOverrides({
        description: {
          value: "Short override",
          base: "x".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 5),
        },
      }),
    ).toEqual({
      description: {
        value: "Short override",
        base: "x".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 5),
      },
    });
  });
});
