/** Redirect host for display: punycode (ASCII), never Unicode (DIDI-1125 Behaviour). */
export function displayRedirectHostFromUri(redirectUri: string): string {
  try {
    return new URL(redirectUri).hostname;
  } catch {
    return "";
  }
}
