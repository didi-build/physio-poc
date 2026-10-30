/** Redact fal API key material from untrusted text (logs and safe errors). */
export function redactFalKey(text: string, falKey: string): string {
  if (!falKey) return text;
  return text.split(falKey).join("[REDACTED_FAL_KEY]");
}

export function redactAuthorizationHeader(text: string): string {
  return text.replace(
    /Authorization:\s*Key\s+\S+/gi,
    "Authorization: Key [REDACTED_FAL_KEY]",
  );
}

export function redactFalSecrets(text: string, falKey: string): string {
  return redactAuthorizationHeader(redactFalKey(text, falKey));
}
