/** Extract redirect target from After Allow / After Deny HTML (tests and clients). */
export function extractRedirectTargetFromConsentHtml(html: string): string | null {
  const match = html.match(/window\.location\.replace\(([^)]+)\)/);
  if (!match?.[1]) {
    return null;
  }
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
}
