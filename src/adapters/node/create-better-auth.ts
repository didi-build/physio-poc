import type Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import {
  ALLOWLIST_REFUSAL_ERROR,
  isEmailAllowlisted,
} from "../../auth/allowed-emails.js";
import {
  createPhysioBetterAuthDatabaseHooks as createMinimalStorageDatabaseHooks,
  PHYSIO_GOOGLE_OAUTH_SCOPES,
  stripPhysioSessionMetadata,
} from "../../auth/better-auth-minimal-storage.js";
import {
  bindPractitionerForSessionUser,
  runPhysioUserCreateBeforeHook,
  runPhysioUserUpdateBeforeHook,
} from "../../auth/physio-better-auth-hooks.js";
export { PhysioPractitionerBindingError } from "../../auth/physio-better-auth-hooks.js";
import { installFakeGoogleFetch } from "../../auth/fake-google-http.js";
import type { PhysioAuthConfig } from "../../http/config.js";
import { resolveBetterAuthSecretForRuntime } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { findPractitionerByEmail } from "../../storage/repositories/practitioner-auth.js";

import type { BetterAuthHandle, BetterAuthRuntime } from "./better-auth-types.js";

export type CreateBetterAuthInstanceOptions = {
  /** Test-only: exercise user-create hook fail-closed without validateUserInfo practitioner check. */
  skipValidateUserInfoPractitionerCheck?: boolean;
};

function mergePhysioDatabaseHooks(sql: SqlStoragePort, authConfig: PhysioAuthConfig) {
  const storageHooks = createMinimalStorageDatabaseHooks();
  return {
    ...storageHooks,
    user: {
      create: {
        before: async (user: Record<string, unknown>) =>
          runPhysioUserCreateBeforeHook(sql, authConfig, user),
      },
      update: {
        before: async (user: Record<string, unknown>) =>
          runPhysioUserUpdateBeforeHook(user),
      },
    },
    session: {
      ...storageHooks.session,
      create: {
        before: async (session: Record<string, unknown>) => {
          await bindPractitionerForSessionUser(sql, session);
          return { data: stripPhysioSessionMetadata(session) };
        },
      },
    },
  };
}

export const PHYSIO_BETTER_AUTH_ACCOUNT = {
  encryptOAuthTokens: true,
} as const;

function fakeGooglePlugin(config: PhysioAuthConfig) {
  const base = config.authBaseUrl.replace(/\/$/, "");
  return genericOAuth({
    config: [
      {
        providerId: "google",
        clientId: config.googleClientId || "fake-google-client",
        clientSecret: config.googleClientSecret || "fake-google-secret",
        authorizationUrl: `${base}/__fake-google/o/oauth2/v2/auth`,
        tokenUrl: `${base}/__fake-google/token`,
        userInfoUrl: `${base}/__fake-google/oauth2/v3/userinfo`,
        scopes: [...PHYSIO_GOOGLE_OAUTH_SCOPES],
        pkce: true,
        accountSubject: ({ profile }) => {
          const sub = profile.sub ?? profile.id;
          return typeof sub === "string" || typeof sub === "number"
            ? String(sub)
            : "fixture-subject";
        },
        mapProfileToUser: (profile) => ({
          email: typeof profile.email === "string" ? profile.email : null,
          name: typeof profile.name === "string" ? profile.name : "Fixture user",
          emailVerified:
            profile.email_verified === true || profile.emailVerified === true,
          image: undefined,
        }),
      },
    ],
  });
}

function googleSocialProvider(config: PhysioAuthConfig) {
  return {
    google: {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      accessType: "online" as const,
      scope: [] as string[],
    },
  };
}

export function createBetterAuthInstance(
  database: Database.Database,
  config: PhysioAuthConfig,
  sql: SqlStoragePort,
  options: CreateBetterAuthInstanceOptions = {},
): BetterAuthHandle {
  const plugins = config.fakeGoogleProviderEnabled ? [fakeGooglePlugin(config)] : [];
  if (config.fakeGoogleProviderEnabled) {
    installFakeGoogleFetch(config.authBaseUrl);
  }

  const secret = resolveBetterAuthSecretForRuntime(config.betterAuthSecret);
  const trustedOrigin = new URL(config.authBaseUrl).origin;

  const auth = betterAuth({
    secret,
    baseURL: config.authBaseUrl,
    basePath: "/api/auth",
    trustedOrigins: [trustedOrigin],
    database,
    emailAndPassword: { enabled: false },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    socialProviders: config.fakeGoogleProviderEnabled
      ? {}
      : googleSocialProvider(config),
    account: PHYSIO_BETTER_AUTH_ACCOUNT,
    databaseHooks: mergePhysioDatabaseHooks(sql, config) as NonNullable<
      Parameters<typeof betterAuth>[0]["databaseHooks"]
    >,
    plugins,
    user: {
      additionalFields: {
        practitionerId: {
          type: "string",
          required: false,
          input: false,
        },
      },
      validateUserInfo: async ({ user, source }) => {
        if (source.oauth?.providerId !== "google") {
          return;
        }
        const email = typeof user.email === "string" ? user.email : null;
        const verified =
          user.emailVerified === true ||
          (user as { email_verified?: boolean }).email_verified === true;
        if (!verified) {
          return { error: ALLOWLIST_REFUSAL_ERROR };
        }
        if (!isEmailAllowlisted(config.allowedGoogleEmails, email)) {
          return { error: ALLOWLIST_REFUSAL_ERROR };
        }
        if (email && !options.skipValidateUserInfoPractitionerCheck) {
          const practitioner = await findPractitionerByEmail(sql, email);
          if (!practitioner) {
            return { error: ALLOWLIST_REFUSAL_ERROR };
          }
        }
      },
    },
    onAPIError: {
      errorURL: "/api/auth/oauth-error",
    },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: true,
      ipAddress: {
        disableIpTracking: true,
      },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      },
    },
  });

  return {
    auth: auth as BetterAuthRuntime,
    sessionCookieName: "better-auth.session_token",
  };
}
