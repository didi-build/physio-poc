import { parseAllowedGoogleEmails } from "../auth/allowed-emails.js";

export type PhysioAuthConfig = {
  readonly betterAuthSecret: string;
  readonly googleClientId: string;
  readonly googleClientSecret: string;
  readonly allowedGoogleEmails: ReadonlySet<string>;
  readonly fakeGoogleProviderEnabled: boolean;
  /** Public origin for Better Auth (same host the browser uses). */
  readonly authBaseUrl: string;
};

/**
 * Runtime-neutral server configuration injected by entrypoints.
 */
export type PhysioServerConfig = {
  readonly webAppBaseUrl: string;
  readonly auth: PhysioAuthConfig;
};

export const DEFAULT_WEB_APP_BASE_URL = "https://app.example.com";

export class InvalidWebAppBaseUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebAppBaseUrlError";
  }
}

export class InvalidAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuthConfigError";
  }
}

const MIN_BETTER_AUTH_SECRET_LENGTH = 32;

const PLACEHOLDER_BETTER_AUTH_SECRETS = new Set([
  "replace-me-with-at-least-32-characters-long",
]);

/** Validates Better Auth startup secret (Node adapter only). No default or fallback secret. */
export function resolveBetterAuthSecretForRuntime(betterAuthSecret: string): string {
  const trimmed = betterAuthSecret.trim();
  if (PLACEHOLDER_BETTER_AUTH_SECRETS.has(trimmed)) {
    throw new InvalidAuthConfigError(
      "BETTER_AUTH_SECRET must be replaced with a local secret (not the .dev.vars.example placeholder).",
    );
  }
  if (trimmed.length >= MIN_BETTER_AUTH_SECRET_LENGTH) {
    return trimmed;
  }
  throw new InvalidAuthConfigError(
    "BETTER_AUTH_SECRET is required (at least 32 characters).",
  );
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

export function resolveAuthBaseUrl(
  raw: string | undefined,
  fallbackHost: string,
): string {
  const trimmed = raw?.trim();
  if (trimmed && trimmed.length > 0) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new InvalidAuthConfigError("AUTH_BASE_URL must be a valid URL.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new InvalidAuthConfigError("AUTH_BASE_URL must use http or https.");
    }
    return trimmed.replace(/\/$/, "");
  }
  return `http://${fallbackHost}`.replace(/\/$/, "");
}

export function resolvePhysioAuthConfig(input: {
  betterAuthSecret?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  allowedGoogleEmails?: string;
  fakeGoogleProvider?: string;
  authBaseUrl?: string;
  fallbackHost?: string;
  nodeEnv?: string;
}): PhysioAuthConfig {
  const nodeEnv = input.nodeEnv?.trim() || "development";
  const fakeRaw = input.fakeGoogleProvider?.trim().toLowerCase();
  const fakeGoogleProviderEnabled = fakeRaw === "true" || fakeRaw === "1";
  if (nodeEnv === "production" && fakeGoogleProviderEnabled) {
    throw new InvalidAuthConfigError(
      "PHYSIO_USE_FAKE_GOOGLE_PROVIDER cannot be enabled in production.",
    );
  }

  const trimmedSecret = input.betterAuthSecret?.trim() ?? "";

  return {
    betterAuthSecret: trimmedSecret,
    googleClientId: input.googleClientId?.trim() ?? "",
    googleClientSecret: input.googleClientSecret?.trim() ?? "",
    allowedGoogleEmails: parseAllowedGoogleEmails(input.allowedGoogleEmails),
    fakeGoogleProviderEnabled,
    authBaseUrl: resolveAuthBaseUrl(
      input.authBaseUrl,
      input.fallbackHost ?? "127.0.0.1:8787",
    ),
  };
}

export function createPhysioServerConfig(input: {
  webAppBaseUrl?: string;
  auth: PhysioAuthConfig;
}): PhysioServerConfig {
  return {
    webAppBaseUrl: resolveWebAppBaseUrl(input.webAppBaseUrl),
    auth: input.auth,
  };
}
