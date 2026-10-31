const PROGRAM_CODE_PREFIX = "PRG-";
const CODE_SUFFIX_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_SUFFIX_LENGTH = 4;

function randomSuffix(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (let i = 0; i < length; i += 1) {
    const index = bytes[i] % CODE_SUFFIX_ALPHABET.length;
    suffix += CODE_SUFFIX_ALPHABET[index] ?? "0";
  }
  return suffix;
}

/** Canonical program code with PRG- prefix, unique and free of patient details. */
export function generateProgramCode(): string {
  return `${PROGRAM_CODE_PREFIX}${randomSuffix(CODE_SUFFIX_LENGTH)}`;
}

/** Trim and uppercase a path or query segment without inserting the PRG- prefix. */
export function trimUppercaseProgramCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Program code must not be empty");
  }
  return trimmed.toUpperCase();
}

/** True when the value is already canonical PRG-XXXX (no prefix completion). */
export function isCanonicalProgramCodeFormat(code: string): boolean {
  if (!code.startsWith(PROGRAM_CODE_PREFIX)) {
    return false;
  }
  const suffix = code.slice(PROGRAM_CODE_PREFIX.length);
  if (suffix.length !== CODE_SUFFIX_LENGTH) {
    return false;
  }
  return [...suffix].every((char) => CODE_SUFFIX_ALPHABET.includes(char));
}

/** Uppercase canonical code for storage and lookup. */
export function normalizeProgramCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Program code must not be empty");
  }
  const upper = trimmed.toUpperCase();
  if (upper.startsWith(PROGRAM_CODE_PREFIX)) {
    return upper;
  }
  if (upper.startsWith("PRG")) {
    const rest = upper.slice(3).replace(/^-/, "");
    return `${PROGRAM_CODE_PREFIX}${rest}`;
  }
  return `${PROGRAM_CODE_PREFIX}${upper}`;
}

/**
 * Search keys for a code query (with or without the PRG- prefix).
 * Also tries PRG- plus the raw trimmed input so PRG7 finds PRG-PRG7.
 */
export function programCodeSearchKeys(input: string): string[] {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const upper = trimmed.toUpperCase();
  const keys = new Set<string>();
  keys.add(`${PROGRAM_CODE_PREFIX}${upper}`);
  if (upper.startsWith(PROGRAM_CODE_PREFIX)) {
    keys.add(upper);
  }
  try {
    keys.add(normalizeProgramCode(trimmed));
  } catch {
    // ignore
  }
  const suffix = upper.replace(/^PRG-?/, "");
  if (suffix.length > 0 && suffix !== upper) {
    keys.add(`${PROGRAM_CODE_PREFIX}${suffix}`);
    keys.add(`PRG${suffix}`);
  }
  return [...keys];
}

export function isValidProgramCodeFormat(code: string): boolean {
  let normalized: string;
  try {
    normalized = normalizeProgramCode(code);
  } catch {
    return false;
  }
  const suffix = normalized.slice(PROGRAM_CODE_PREFIX.length);
  if (suffix.length !== CODE_SUFFIX_LENGTH) {
    return false;
  }
  return [...suffix].every((char) => CODE_SUFFIX_ALPHABET.includes(char));
}

export const PROGRAM_CODE_SUFFIX_ALPHABET = CODE_SUFFIX_ALPHABET;
