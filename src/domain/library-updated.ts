import {
  TEXT_OVERRIDE_KEYS,
  type LibraryVersionText,
  type TextOverrideEntry,
  type TextOverrideKey,
  type TextOverrides,
} from "./exercise-text-overrides.js";

export function libraryTextForKey(
  version: LibraryVersionText,
  key: TextOverrideKey,
): string {
  if (key === "title") {
    return version.title;
  }
  if (key === "description") {
    return version.description;
  }
  const raw = version[key];
  return raw ?? "";
}

export function isTextOverrideLibraryUpdated(
  entry: TextOverrideEntry,
  libraryValue: string,
): boolean {
  return entry.base !== libraryValue;
}

export function listLibraryUpdatedTextFields(
  overrides: TextOverrides,
  version: LibraryVersionText,
): TextOverrideKey[] {
  const updated: TextOverrideKey[] = [];
  for (const key of TEXT_OVERRIDE_KEYS) {
    const entry = overrides[key];
    if (!entry) {
      continue;
    }
    if (isTextOverrideLibraryUpdated(entry, libraryTextForKey(version, key))) {
      updated.push(key);
    }
  }
  return updated;
}

export function hasAnyTextOverride(overrides: TextOverrides): boolean {
  return TEXT_OVERRIDE_KEYS.some((key) => overrides[key] !== undefined);
}
