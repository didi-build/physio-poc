/** Google OAuth scopes for Physio (no offline access / refresh tokens). */
export const PHYSIO_GOOGLE_OAUTH_SCOPES = ["openid", "email", "profile"] as const;

const PLAINTEXT_JWT_PREFIX = "eyJ";

export function normalizePhysioOAuthScope(
  scope: string | null | undefined,
): string | null {
  if (scope == null || scope.trim().length === 0) {
    return PHYSIO_GOOGLE_OAUTH_SCOPES.join(" ");
  }
  const parts = scope
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const allowed = new Set<string>(PHYSIO_GOOGLE_OAUTH_SCOPES);
  const filtered = parts.filter((part) => allowed.has(part));
  return filtered.length > 0
    ? filtered.join(" ")
    : PHYSIO_GOOGLE_OAUTH_SCOPES.join(" ");
}

export function stripPhysioAccountSecrets<T extends Record<string, unknown>>(
  account: T,
): T {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    password: null,
    scope: normalizePhysioOAuthScope(
      typeof account.scope === "string" ? account.scope : null,
    ),
  };
}

export function stripPhysioSessionMetadata<T extends Record<string, unknown>>(
  session: T,
): T {
  return {
    ...session,
    ipAddress: null,
    userAgent: null,
  };
}

export function stripPhysioUserImage<T extends Record<string, unknown>>(user: T): T {
  return {
    ...user,
    image: null,
  };
}

/** Removes client-supplied practitioner binding; only server hooks may set it. */
export function stripClientPractitionerId<T extends Record<string, unknown>>(
  user: T,
): T {
  const next = { ...user };
  delete next.practitionerId;
  return next;
}

export function looksLikePlaintextOAuthToken(
  value: string | null | undefined,
): boolean {
  if (value == null || value.length === 0) {
    return false;
  }
  return value.startsWith(PLAINTEXT_JWT_PREFIX);
}

export function createPhysioBetterAuthDatabaseHooks() {
  return {
    user: {
      create: {
        before: async (user: Record<string, unknown>) => ({
          data: stripPhysioUserImage(user),
        }),
      },
      update: {
        before: async (user: Record<string, unknown>) => ({
          data: stripPhysioUserImage(user),
        }),
      },
    },
    session: {
      create: {
        before: async (session: Record<string, unknown>) => ({
          data: stripPhysioSessionMetadata(session),
        }),
      },
      update: {
        before: async (session: Record<string, unknown>) => ({
          data: stripPhysioSessionMetadata(session),
        }),
      },
    },
    account: {
      create: {
        before: async (account: Record<string, unknown>) => ({
          data: stripPhysioAccountSecrets(account),
        }),
      },
      update: {
        before: async (account: Record<string, unknown>) => ({
          data: stripPhysioAccountSecrets(account),
        }),
      },
    },
  };
}
