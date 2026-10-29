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

export type TextOverrideEntry = {
  value: string;
  base: string;
};

export type TextOverrides = Partial<Record<TextOverrideKey, TextOverrideEntry>>;

const TEXT_KEY_SET = new Set<string>(TEXT_OVERRIDE_KEYS);
const TEXT_OVERRIDE_ENTRY_KEYS = new Set<string>(["value", "base"]);

export class TextOverrideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextOverrideValidationError";
  }
}

/** Stored JSON used plain strings per field; reject on read. */
export class TextOverrideLegacyShapeError extends TextOverrideValidationError {
  constructor() {
    super("Text overrides must use { value, base } objects");
    this.name = "TextOverrideLegacyShapeError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateTextOverrideBase(key: TextOverrideKey, base: string): string {
  if (typeof base !== "string") {
    throw new TextOverrideValidationError(`Override ${key} base must be a string`);
  }
  if (key.startsWith("cue_") && base === "") {
    return "";
  }
  return validateTextOverrideValue(key, base);
}

function parseTextOverrideEntry(key: TextOverrideKey, raw: unknown): TextOverrideEntry {
  if (typeof raw === "string") {
    throw new TextOverrideLegacyShapeError();
  }
  if (!isPlainObject(raw)) {
    throw new TextOverrideValidationError(
      `Override ${key} must be an object with value and base`,
    );
  }
  for (const entryKey of Object.keys(raw)) {
    if (!TEXT_OVERRIDE_ENTRY_KEYS.has(entryKey)) {
      throw new TextOverrideValidationError(
        `Unknown key in ${key} override: ${entryKey}`,
      );
    }
  }
  if (!("value" in raw) || !("base" in raw)) {
    throw new TextOverrideValidationError(
      `Override ${key} must include value and base`,
    );
  }
  const valueRaw = raw.value;
  const baseRaw = raw.base;
  if (typeof valueRaw !== "string") {
    throw new TextOverrideValidationError(`Override ${key} value must be a string`);
  }
  if (typeof baseRaw !== "string") {
    throw new TextOverrideValidationError(`Override ${key} base must be a string`);
  }
  return {
    value: validateTextOverrideValue(key, valueRaw),
    base: validateTextOverrideBase(key, baseRaw),
  };
}

export function serializeTextOverrides(overrides: TextOverrides): string {
  return JSON.stringify(overrides);
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
    try {
      result[key as TextOverrideKey] = parseTextOverrideEntry(
        key as TextOverrideKey,
        raw,
      );
    } catch (err) {
      if (err instanceof TextOverrideLegacyShapeError) {
        throw err;
      }
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
    return overrides.title?.value ?? version.title;
  }
  if (field === "description") {
    return overrides.description?.value ?? version.description;
  }
  const cueKey = cueFieldForType(prescriptionType);
  const overrideCue = overrides[cueKey];
  if (overrideCue !== undefined) {
    return overrideCue.value;
  }
  const libraryCue = version[cueKey];
  return libraryCue ?? "";
}

export function buildTextOverrideEntry(
  key: TextOverrideKey,
  value: string,
  libraryBase: string,
): TextOverrideEntry {
  const baseForEntry = libraryBase === "" && key.startsWith("cue_") ? "" : libraryBase;
  return {
    value: validateTextOverrideValue(key, value),
    base: validateTextOverrideBase(key, baseForEntry),
  };
}

export function applyUseLibraryVersion(
  overrides: TextOverrides,
  key: TextOverrideKey,
): TextOverrides {
  const next = { ...overrides };
  delete next[key];
  return next;
}

export function applyKeepMine(
  overrides: TextOverrides,
  key: TextOverrideKey,
  libraryValue: string,
): TextOverrides {
  const entry = overrides[key];
  if (!entry) {
    return overrides;
  }
  const baseForEntry =
    libraryValue === "" && key.startsWith("cue_") ? "" : libraryValue;
  return {
    ...overrides,
    [key]: {
      value: entry.value,
      base: validateTextOverrideBase(key, baseForEntry),
    },
  };
}
