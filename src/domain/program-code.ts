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

/** Search keys for a code query (with or without the PRG- prefix). */
export function programCodeSearchKeys(input: string): string[] {
  const canonical = normalizeProgramCode(input);
  const suffix = canonical.slice(PROGRAM_CODE_PREFIX.length);
  const keys = new Set<string>([canonical]);
  if (suffix.length > 0) {
    keys.add(suffix);
    keys.add(`PRG${suffix}`);
  }
  return [...keys];
}

export function isValidProgramCodeFormat(code: string): boolean {
  const normalized = normalizeProgramCode(code);
  const suffix = normalized.slice(PROGRAM_CODE_PREFIX.length);
  if (suffix.length !== CODE_SUFFIX_LENGTH) {
    return false;
  }
  return [...suffix].every((char) => CODE_SUFFIX_ALPHABET.includes(char));
}
