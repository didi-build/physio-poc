/** JSON embedded in inline scripts must not contain raw `<` (DIDI-1126). */
export function jsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/** Escape untrusted text for HTML text nodes and attributes (DIDI-1126). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
