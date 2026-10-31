import { APIError, betterAuth } from "better-auth";
import {
  ALLOWLIST_REFUSAL_ERROR,
  isEmailAllowlisted,
} from "../../auth/allowed-emails.js";
import {
  createPhysioBetterAuthDatabaseHooks as createMinimalStorageDatabaseHooks,
  stripPhysioSessionMetadata,
} from "../../auth/better-auth-minimal-storage.js";
import {
  bindPractitionerForSessionUser,
  PhysioPractitionerBindingError,
  runPhysioUserCreateBeforeHook,
  runPhysioUserUpdateBeforeHook,
} from "../../auth/physio-better-auth-hooks.js";
export { PhysioPractitionerBindingError } from "../../auth/physio-better-auth-hooks.js";
import type { PhysioAuthConfig } from "../../http/config.js";
import { resolveBetterAuthSecretForRuntime } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { findPractitionerByEmail } from "../../storage/repositories/practitioner-auth.js";

export function createPhysioBetterAuthDatabaseHooks(
  sql: SqlStoragePort,
  authConfig: PhysioAuthConfig,
) {
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
          try {
            await bindPractitionerForSessionUser(sql, session);
          } catch (error) {
            if (
              error instanceof PhysioPractitionerBindingError &&
              error.message === "practitioner_id_email_mismatch"
            ) {
              throw new APIError("FORBIDDEN", {
                code: ALLOWLIST_REFUSAL_ERROR,
                message: ALLOWLIST_REFUSAL_ERROR,
              });
            }
            throw error;
          }
          return { data: stripPhysioSessionMetadata(session) };
        },
      },
    },
  };
}

export function createDefaultPhysioValidateUserInfo(
  sql: SqlStoragePort,
  config: PhysioAuthConfig,
): NonNullable<
  NonNullable<Parameters<typeof betterAuth>[0]["user"]>["validateUserInfo"]
> {
  return async ({ user, source }) => {
    if (source.oauth?.providerId !== "google") {
      return { error: ALLOWLIST_REFUSAL_ERROR };
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
    if (email) {
      const practitioner = await findPractitionerByEmail(sql, email);
      if (!practitioner) {
        return { error: ALLOWLIST_REFUSAL_ERROR };
      }
    }
  };
}

export const PHYSIO_BETTER_AUTH_ACCOUNT = {
  encryptOAuthTokens: true,
} as const;

/** Session cookie and DB row lifetime in seconds (7 days). Pinned explicitly for DIDI-1091. */
export const PHYSIO_BETTER_AUTH_SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;

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

export function buildPhysioBetterAuthOptions(
  sql: SqlStoragePort,
  config: PhysioAuthConfig,
): Omit<Parameters<typeof betterAuth>[0], "database"> {
  const secret = resolveBetterAuthSecretForRuntime(config.betterAuthSecret);
  const trustedOrigin = new URL(config.authBaseUrl).origin;
  return {
    secret,
    baseURL: config.authBaseUrl,
    basePath: "/api/auth",
    trustedOrigins: [trustedOrigin],
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: PHYSIO_BETTER_AUTH_SESSION_EXPIRES_IN_SECONDS,
    },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    socialProviders: googleSocialProvider(config),
    account: PHYSIO_BETTER_AUTH_ACCOUNT,
    databaseHooks: createPhysioBetterAuthDatabaseHooks(sql, config) as NonNullable<
      Parameters<typeof betterAuth>[0]["databaseHooks"]
    >,
    plugins: [],
    user: {
      additionalFields: {
        practitionerId: {
          type: "string",
          required: false,
          input: false,
        },
      },
      validateUserInfo: createDefaultPhysioValidateUserInfo(sql, config),
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
  };
}
