/** Lowercase canonical UUID (8-4-4-4-12), explicit hex class (locale-safe). */
export const LOWERCASE_CANONICAL_UUID_RE =
  /^[0123456789abcdef]{8}-[0123456789abcdef]{4}-[0123456789abcdef]{4}-[0123456789abcdef]{4}-[0123456789abcdef]{12}$/;

export function isLowercaseCanonicalUuid(id) {
  return typeof id === "string" && LOWERCASE_CANONICAL_UUID_RE.test(id);
}
