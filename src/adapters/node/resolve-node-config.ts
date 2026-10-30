import {
  createPhysioServerConfig,
  resolvePhysioAuthConfig,
  resolveWebAppBaseUrl,
} from "../../http/config.js";
import type { PhysioServerConfig } from "../../http/config.js";

export type NodeEnvInput = {
  WEB_APP_BASE_URL?: string;
  AUTH_BASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PHYSIO_ALLOWED_GOOGLE_EMAILS?: string;
  PHYSIO_USE_FAKE_GOOGLE_PROVIDER?: string;
  NODE_ENV?: string;
};

export function resolveNodePhysioServerConfig(
  env: NodeEnvInput,
  fallbackHost = "127.0.0.1:8787",
): PhysioServerConfig {
  const auth = resolvePhysioAuthConfig({
    betterAuthSecret: env.BETTER_AUTH_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    allowedGoogleEmails: env.PHYSIO_ALLOWED_GOOGLE_EMAILS,
    fakeGoogleProvider: env.PHYSIO_USE_FAKE_GOOGLE_PROVIDER,
    authBaseUrl: env.AUTH_BASE_URL,
    fallbackHost,
    nodeEnv: env.NODE_ENV,
  });
  return createPhysioServerConfig({
    webAppBaseUrl: env.WEB_APP_BASE_URL,
    auth,
  });
}

export function resolveTestPhysioServerConfig(
  overrides: Partial<{
    webAppBaseUrl: string;
    authBaseUrl: string;
    allowedGoogleEmails: string;
    fakeGoogleProvider: boolean;
    betterAuthSecret: string;
  }> = {},
): PhysioServerConfig {
  const authBaseUrl = overrides.authBaseUrl ?? "http://127.0.0.1:8787";
  return createPhysioServerConfig({
    webAppBaseUrl: overrides.webAppBaseUrl ?? "https://app.example.com",
    auth: {
      betterAuthSecret:
        overrides.betterAuthSecret ?? "test-better-auth-secret-min-32-chars",
      googleClientId: "fake-google-client-id",
      googleClientSecret: "fake-google-client-secret",
      allowedGoogleEmails: new Set(
        (overrides.allowedGoogleEmails ?? "kojo.allowed@example.com")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
      fakeGoogleProviderEnabled: overrides.fakeGoogleProvider ?? true,
      authBaseUrl,
    },
  });
}

export { resolveWebAppBaseUrl };
