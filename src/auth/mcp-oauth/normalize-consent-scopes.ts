/** Canonical scope set JSON for remembered-consent keys (sorted, space-split input). */
export function scopesJsonFromOAuthScopeParam(scopeParam: string): string {
  const scopes = scopeParam.split(/\s+/).filter(Boolean).sort();
  return JSON.stringify(scopes);
}

export function scopesJsonFromStoredList(scopes: readonly string[]): string {
  return JSON.stringify([...scopes].sort());
}
