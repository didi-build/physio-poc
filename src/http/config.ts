/**
 * Runtime-neutral server configuration injected by entrypoints.
 */
export type PhysioServerConfig = {
  readonly webAppBaseUrl: string;
};

export const DEFAULT_WEB_APP_BASE_URL = "https://app.example.com";

export class InvalidWebAppBaseUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebAppBaseUrlError";
  }
}

export function resolveWebAppBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  const candidate = trimmed && trimmed.length > 0 ? trimmed : DEFAULT_WEB_APP_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new InvalidWebAppBaseUrlError("WEB_APP_BASE_URL must be a valid https URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new InvalidWebAppBaseUrlError("WEB_APP_BASE_URL must use https.");
  }
  return candidate;
}
