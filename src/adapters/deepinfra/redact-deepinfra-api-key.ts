function jsonEscapedFragment(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/** Remove a DeepInfra API key from text that may echo request headers or bodies. */
export function redactDeepInfraApiKey(text: string, apiKey: string): string {
  if (!apiKey) {
    return text;
  }
  let next = text;
  const replacements = [
    apiKey,
    jsonEscapedFragment(apiKey),
    `Bearer ${apiKey}`,
    jsonEscapedFragment(`Bearer ${apiKey}`),
  ];
  for (const fragment of replacements) {
    if (fragment.length === 0) {
      continue;
    }
    next = next.split(fragment).join("[redacted]");
  }
  return next;
}
