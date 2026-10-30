const MAX_CLIENT_NAME_LENGTH = 64;

const BIDI_ISOLATE_CODE_POINTS = new Set([0x061c, 0x2066, 0x2067, 0x2068, 0x2069]);

function isUnsafeClientNameCodePoint(codePoint: number): boolean {
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
    return true;
  }
  if (codePoint >= 0x200b && codePoint <= 0x200f) {
    return true;
  }
  if (codePoint >= 0x202a && codePoint <= 0x202e) {
    return true;
  }
  if (codePoint >= 0x2060 && codePoint <= 0x206f) {
    return true;
  }
  if (codePoint === 0xfeff) {
    return true;
  }
  return BIDI_ISOLATE_CODE_POINTS.has(codePoint);
}

function stripUnsafeClientNameChars(value: string): string {
  let output = "";
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || isUnsafeClientNameCodePoint(codePoint)) {
      continue;
    }
    output += char;
  }
  return output;
}

function truncateToMaxGraphemes(value: string, maxGraphemes: number): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes: string[] = [];
  for (const { segment } of segmenter.segment(value)) {
    graphemes.push(segment);
  }
  if (graphemes.length <= maxGraphemes) {
    return value;
  }
  return graphemes.slice(0, maxGraphemes).join("");
}

/** Server-side client display name sanitization (DIDI-1043). */
export function sanitizeOAuthClientDisplayName(
  rawName: string | null | undefined,
  fallbackHost: string,
): string {
  const normalized = stripUnsafeClientNameChars((rawName ?? "").normalize("NFC"));
  const trimmed = normalized.trim();
  if (trimmed.length === 0) {
    return truncateToMaxGraphemes(fallbackHost, MAX_CLIENT_NAME_LENGTH);
  }
  return truncateToMaxGraphemes(trimmed, MAX_CLIENT_NAME_LENGTH);
}

export function hostFromUrl(urlString: string): string {
  try {
    return new URL(urlString).hostname;
  } catch {
    return "";
  }
}

export function countGraphemes(value: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(value)].length;
}
