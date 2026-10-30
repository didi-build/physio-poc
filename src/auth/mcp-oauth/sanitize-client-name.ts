const MAX_CLIENT_NAME_LENGTH = 64;

function stripUnsafeClientNameChars(value: string): string {
  let output = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isAsciiControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    const isBidiOrZeroWidth =
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f) ||
      code === 0xfeff;
    if (!isAsciiControl && !isBidiOrZeroWidth) {
      output += char;
    }
  }
  return output;
}

/** Server-side client display name sanitization (DIDI-1043). */
export function sanitizeOAuthClientDisplayName(
  rawName: string | null | undefined,
  fallbackHost: string,
): string {
  const normalized = stripUnsafeClientNameChars((rawName ?? "").normalize("NFC"));
  const trimmed = normalized.trim();
  if (trimmed.length === 0) {
    return fallbackHost.slice(0, MAX_CLIENT_NAME_LENGTH);
  }
  if (trimmed.length <= MAX_CLIENT_NAME_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_CLIENT_NAME_LENGTH);
}

export function hostFromUrl(urlString: string): string {
  try {
    return new URL(urlString).hostname;
  } catch {
    return "";
  }
}
