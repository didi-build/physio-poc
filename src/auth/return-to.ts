/**
 * Same-origin relative return paths only (DIDI-1001).
 */
function hasAsciiControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function normalizeReturnTo(raw: string | null | undefined): string {
  if (!raw) {
    return "/";
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) {
    return "/";
  }
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return "/";
  }
  if (trimmed.includes("\\")) {
    return "/";
  }
  if (hasAsciiControlChar(trimmed)) {
    return "/";
  }
  if (trimmed.includes("://")) {
    return "/";
  }
  return trimmed;
}

export function signInPathWithReturnTo(returnTo: string): string {
  const safe = normalizeReturnTo(returnTo);
  const params = new URLSearchParams({ returnTo: safe });
  return `/sign-in?${params.toString()}`;
}
