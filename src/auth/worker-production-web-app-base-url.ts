import { InvalidWebAppBaseUrlError } from "../http/config.js";

/** Production Worker WEB_APP_BASE_URL: bare https origin only (DIDI-1153 / #59 preflight rule). */
export function resolveWorkerProductionWebAppBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new InvalidWebAppBaseUrlError("WEB_APP_BASE_URL is required.");
  }
  if (trimmed.endsWith("/")) {
    throw new InvalidWebAppBaseUrlError(
      "WEB_APP_BASE_URL must not include a trailing slash.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InvalidWebAppBaseUrlError("WEB_APP_BASE_URL must be a valid https URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new InvalidWebAppBaseUrlError("WEB_APP_BASE_URL must use https.");
  }
  if (parsed.username || parsed.password) {
    throw new InvalidWebAppBaseUrlError("WEB_APP_BASE_URL must not include userinfo.");
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    throw new InvalidWebAppBaseUrlError("WEB_APP_BASE_URL must not include a path.");
  }
  if (parsed.search) {
    throw new InvalidWebAppBaseUrlError("WEB_APP_BASE_URL must not include a query.");
  }
  if (parsed.hash) {
    throw new InvalidWebAppBaseUrlError(
      "WEB_APP_BASE_URL must not include a fragment.",
    );
  }
  return `${parsed.protocol}//${parsed.host}`;
}
