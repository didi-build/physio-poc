/**
 * Runtime-neutral server configuration injected by entrypoints.
 */
export type PhysioServerConfig = {
  readonly webAppBaseUrl: string;
};

export const DEFAULT_WEB_APP_BASE_URL = "https://app.example.com";

export function resolveWebAppBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_WEB_APP_BASE_URL;
}
