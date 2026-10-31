import { genericOAuth } from "better-auth/plugins";
import { installFakeGoogleFetch } from "../../auth/fake-google-http.js";
import type { PhysioAuthConfig } from "../../http/config.js";
import { PHYSIO_GOOGLE_OAUTH_SCOPES } from "../../auth/better-auth-minimal-storage.js";
import type { BuildPhysioBetterAuthOptionsInput } from "./create-physio-better-auth-instance.js";
import { buildPhysioBetterAuthOptions } from "./create-better-auth-core.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";

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

export function installFakeGoogleForBetterAuth(authBaseUrl: string): void {
  installFakeGoogleFetch(authBaseUrl);
}

export function buildFakeGooglePhysioBetterAuthOptions(
  sql: SqlStoragePort,
  config: PhysioAuthConfig,
): BuildPhysioBetterAuthOptionsInput {
  const base = buildPhysioBetterAuthOptions(sql, config);
  return {
    ...base,
    socialProviders: {},
    plugins: [fakeGooglePlugin(config)],
  };
}
