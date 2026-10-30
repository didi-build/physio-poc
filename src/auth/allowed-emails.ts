export const ALLOWLIST_REFUSAL_ERROR = "not_allowed";

export function parseAllowedGoogleEmails(raw: string | undefined): ReadonlySet<string> {
  if (!raw?.trim()) {
    return new Set();
  }
  const emails = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  return new Set(emails);
}

export function isEmailAllowlisted(
  allowlist: ReadonlySet<string>,
  email: string | null | undefined,
): boolean {
  if (!email?.trim()) {
    return false;
  }
  return allowlist.has(email.trim().toLowerCase());
}
