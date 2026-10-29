import type { PrescriptionType } from "./exercise-types.js";
import { validateTextOverrideValue } from "./exercise-free-text.js";

export const TEXT_OVERRIDE_KEYS = [
  "title",
  "description",
  "cue_stretching",
  "cue_isometric",
  "cue_concentric",
  "cue_eccentric",
] as const;

export type TextOverrideKey = (typeof TEXT_OVERRIDE_KEYS)[number];

export type TextOverrides = Partial<Record<TextOverrideKey, string>>;

const TEXT_KEY_SET = new Set<string>(TEXT_OVERRIDE_KEYS);

export class TextOverrideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextOverrideValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateTextOverrides(value: unknown): TextOverrides {
  if (!isPlainObject(value)) {
    throw new TextOverrideValidationError("Text overrides must be a JSON object");
  }
  const result: TextOverrides = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!TEXT_KEY_SET.has(key)) {
      throw new TextOverrideValidationError(`Unknown text override key: ${key}`);
    }
    if (typeof raw !== "string") {
      throw new TextOverrideValidationError(`Override ${key} must be a string`);
    }
    try {
      result[key as TextOverrideKey] = validateTextOverrideValue(key, raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new TextOverrideValidationError(message);
    }
  }
  return result;
}

export function parseTextOverridesJson(json: string): TextOverrides {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new TextOverrideValidationError("Text overrides JSON must be valid");
  }
  return validateTextOverrides(parsed);
}

export type LibraryVersionText = {
  title: string;
  description: string;
  cue_stretching: string | null;
  cue_isometric: string | null;
  cue_concentric: string | null;
  cue_eccentric: string | null;
};

export function cueFieldForType(type: PrescriptionType): TextOverrideKey {
  switch (type) {
    case "stretching":
      return "cue_stretching";
    case "isometric":
      return "cue_isometric";
    case "concentric":
      return "cue_concentric";
    case "eccentric":
      return "cue_eccentric";
  }
}

export function resolveTextField(
  overrides: TextOverrides,
  version: LibraryVersionText,
  field: "title" | "description" | "cue",
  prescriptionType: PrescriptionType,
): string {
  if (field === "title") {
    return overrides.title ?? version.title;
  }
  if (field === "description") {
    return overrides.description ?? version.description;
  }
  const cueKey = cueFieldForType(prescriptionType);
  const overrideCue = overrides[cueKey];
  if (overrideCue !== undefined) {
    return overrideCue;
  }
  const libraryCue = version[cueKey];
  return libraryCue ?? "";
}
