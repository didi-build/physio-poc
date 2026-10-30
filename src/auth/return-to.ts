/**
 * Same-origin relative return paths only (DIDI-1001).
 */
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
