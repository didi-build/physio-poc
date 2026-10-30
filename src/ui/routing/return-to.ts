export function normalizeReturnTo(raw: string | null): string {
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
