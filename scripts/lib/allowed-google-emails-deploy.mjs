/**
 * Deploy-time allowlist parsing (must match `parseAllowedGoogleEmails` in allowed-emails.ts).
 */

/**
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseAllowedGoogleEmailsRaw(raw) {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

/**
 * @param {string} entry normalized lowercase entry
 * @returns {boolean}
 */
export function isShapedAllowlistEntry(entry) {
  if (entry.includes(" ")) {
    return false;
  }
  const at = entry.indexOf("@");
  if (at <= 0) {
    return false;
  }
  if (entry.indexOf("@", at + 1) !== -1) {
    return false;
  }
  const domain = entry.slice(at + 1);
  if (!domain.includes(".")) {
    return false;
  }
  return true;
}

/**
 * @param {string | undefined} raw
 * @returns {"PHYSIO_ALLOWED_GOOGLE_EMAILS" | null}
 */
export function productionAllowlistShapeProblemName(raw) {
  if (typeof raw !== "string") {
    return "PHYSIO_ALLOWED_GOOGLE_EMAILS";
  }
  const entries = parseAllowedGoogleEmailsRaw(raw);
  if (entries.length === 0) {
    return "PHYSIO_ALLOWED_GOOGLE_EMAILS";
  }
  for (const entry of entries) {
    if (!isShapedAllowlistEntry(entry)) {
      return "PHYSIO_ALLOWED_GOOGLE_EMAILS";
    }
  }
  return null;
}
