import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { genericOAuth } from "better-auth/plugins";
import { betterAuth } from "better-auth";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import {
  buildPhysioBetterAuthOptions,
  createDefaultPhysioValidateUserInfo,
} from "../src/adapters/node/create-better-auth.js";
import { BetterAuthPort } from "../src/adapters/node/better-auth-port.js";
import { resolveTestPhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import { ALLOWLIST_REFUSAL_ERROR } from "../src/auth/allowed-emails.js";
import { AUTH_REFUSAL_MESSAGE } from "../src/http/auth-pages.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import { installFakeGoogleFetch } from "../src/auth/fake-google-http.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0004_ID,
} from "../src/storage/migrations/apply.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import {
  completeGoogleSignIn,
  CookieJar,
  requestWithJar,
} from "./helpers/google-sign-in-flow.js";
import { MIGRATION_0001_SQL } from "./helpers/exercise-sqlite-fixture.js";
import type { BetterAuthRuntime } from "../src/adapters/node/better-auth-types.js";
import type { AppDependencies } from "../src/http/app.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const MIGRATION_0004_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0004_better_auth.sql"),
  "utf8",
);
const BASE = "http://127.0.0.1:8787";

const VALIDATE_USER_INFO_CONTEXT = {} as Parameters<
  ReturnType<typeof createDefaultPhysioValidateUserInfo>
>[1];

const ALLOWED_USER = {
  email: FAKE_GOOGLE_ALLOWED_EMAIL,
  emailVerified: true,
  name: "Kojo",
} as const;

async function countAuthTables(
  storage: BetterSqliteStorage,
): Promise<{ user: number; account: number; session: number; verification: number }> {
  const user =
    (await storage.first<{ c: number }>('SELECT count(*) as c FROM "user"'))?.c ?? 0;
  const account =
    (await storage.first<{ c: number }>('SELECT count(*) as c FROM "account"'))?.c ?? 0;
  const session =
    (await storage.first<{ c: number }>('SELECT count(*) as c FROM "session"'))?.c ?? 0;
  const verification =
    (await storage.first<{ c: number }>('SELECT count(*) as c FROM "verification"'))
      ?.c ?? 0;
  return { user, account, session, verification };
}

describe("createDefaultPhysioValidateUserInfo (unit)", () => {
  it("refuses when oauth.providerId is not google", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET).auth;
      const validate = createDefaultPhysioValidateUserInfo(storage, config);
      await expect(
        validate(
          {
            user: ALLOWED_USER,
            source: {
              action: "sign-in",
              method: "oauth",
              oauth: { providerId: "github" },
            },
          },
          VALIDATE_USER_INFO_CONTEXT,
        ),
      ).resolves.toEqual({ error: ALLOWLIST_REFUSAL_ERROR });
    } finally {
      storage.close();
    }
  });

  it("refuses when oauth providerId is missing (non-oauth method)", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET).auth;
      const validate = createDefaultPhysioValidateUserInfo(storage, config);
      await expect(
        validate(
          {
            user: ALLOWED_USER,
            source: {
              action: "create-user",
              method: "email-password",
            },
          },
          VALIDATE_USER_INFO_CONTEXT,
        ),
      ).resolves.toEqual({ error: ALLOWLIST_REFUSAL_ERROR });
    } finally {
      storage.close();
    }
  });

  it("allows google oauth when allowlisted, verified, and practitioner exists", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      await storage.run(
        "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
        [
          generateOpaqueEntityId(),
          FAKE_GOOGLE_ALLOWED_EMAIL,
          "2026-01-01T00:00:00.000Z",
        ],
      );
      const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET).auth;
      const validate = createDefaultPhysioValidateUserInfo(storage, config);
      await expect(
        validate(
          {
            user: ALLOWED_USER,
            source: {
              action: "sign-in",
              method: "oauth",
              oauth: { providerId: "google" },
            },
          },
          VALIDATE_USER_INFO_CONTEXT,
        ),
      ).resolves.toBeUndefined();
    } finally {
      storage.close();
    }
  });
});

describe("validateUserInfo provider gate (integration)", () => {
  function createBetterAuthWithExtraOAuthProvider(
    storage: BetterSqliteStorage,
    serverConfig: ReturnType<typeof resolveTestPhysioServerConfig>,
  ): BetterAuthRuntime {
    installFakeGoogleFetch(serverConfig.auth.authBaseUrl);
    const base = serverConfig.auth.authBaseUrl.replace(/\/$/, "");
    const options = buildPhysioBetterAuthOptions(storage, serverConfig.auth);
    const auth = betterAuth({
      ...options,
      plugins: [
        ...(options.plugins ?? []),
        genericOAuth({
          config: [
            {
              providerId: "github",
              clientId: "fake-github-client",
              clientSecret: "fake-github-secret",
              authorizationUrl: `${base}/__fake-google/o/oauth2/v2/auth`,
              tokenUrl: `${base}/__fake-google/token`,
              userInfoUrl: `${base}/__fake-google/oauth2/v3/userinfo`,
              scopes: ["openid", "email", "profile"],
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
        }),
      ],
      database: storage.nativeDatabase(),
    });
    return auth as BetterAuthRuntime;
  }

  it("writes zero auth rows when oauth providerId is not google", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      await storage.run(
        "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
        [
          generateOpaqueEntityId(),
          FAKE_GOOGLE_ALLOWED_EMAIL,
          "2026-01-01T00:00:00.000Z",
        ],
      );
      const serverConfig = resolveTestPhysioServerConfig(
        PHYSIO_TEST_BETTER_AUTH_SECRET,
        { authBaseUrl: BASE },
      );
      const runtime = createBetterAuthWithExtraOAuthProvider(storage, serverConfig);
      const deps: AppDependencies = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: serverConfig,
        auth: new BetterAuthPort(runtime, storage, serverConfig.auth),
        mcp: createPhysioMcpHttpHandler(serverConfig),
        enableFakeGoogleRoutes: true,
      };

      const cookieJar = new CookieJar();
      const signIn = await requestWithJar(
        BASE,
        `${BASE}/api/auth/sign-in/social`,
        deps,
        cookieJar,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: "github", callbackURL: "/exercises" }),
        },
      );
      const payload = (await signIn.json()) as { url?: string };
      expect(payload.url).toBeTruthy();
      const authorizeUrl = new URL(payload.url ?? "");
      authorizeUrl.searchParams.set("fixture", "allowed");
      let response = await requestWithJar(
        BASE,
        authorizeUrl.toString(),
        deps,
        cookieJar,
      );
      for (
        let step = 0;
        step < 8 && response.status >= 300 && response.status < 400;
        step += 1
      ) {
        const nextUrl = response.headers.get("location");
        if (!nextUrl) {
          break;
        }
        response = await requestWithJar(
          BASE,
          new URL(nextUrl, BASE).toString(),
          deps,
          cookieJar,
        );
      }

      const counts = await countAuthTables(storage);
      expect(counts).toEqual({ user: 0, account: 0, session: 0, verification: 0 });
      expect(cookieJar.header()).not.toContain("better-auth.session_token=");
      expect(await response.text()).toContain(AUTH_REFUSAL_MESSAGE);
    } finally {
      storage.close();
    }
  });

  it("still allows google sign-in for an allowlisted verified practitioner", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      await storage.run(
        "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
        [
          generateOpaqueEntityId(),
          FAKE_GOOGLE_ALLOWED_EMAIL,
          "2026-01-01T00:00:00.000Z",
        ],
      );
      const serverConfig = resolveTestPhysioServerConfig(
        PHYSIO_TEST_BETTER_AUTH_SECRET,
        { authBaseUrl: BASE },
      );
      installFakeGoogleFetch(serverConfig.auth.authBaseUrl);
      const options = buildPhysioBetterAuthOptions(storage, serverConfig.auth);
      const runtime = betterAuth({
        ...options,
        database: storage.nativeDatabase(),
      }) as BetterAuthRuntime;
      const deps: AppDependencies = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: serverConfig,
        auth: new BetterAuthPort(runtime, storage, serverConfig.auth),
        mcp: createPhysioMcpHttpHandler(serverConfig),
        enableFakeGoogleRoutes: true,
      };

      const { jar, lastResponse } = await completeGoogleSignIn(BASE, deps, "allowed");
      expect(lastResponse.status).not.toBe(500);
      expect(jar.header()).toContain("better-auth.session_token=");
      const counts = await countAuthTables(storage);
      expect(counts.user).toBe(1);
      expect(counts.account).toBe(1);
      expect(counts.session).toBe(1);
    } finally {
      storage.close();
    }
  });
});
