import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { createDefaultPhysioValidateUserInfo } from "../src/adapters/node/create-better-auth.js";
import { buildPhysioBetterAuthOptionsForConfig } from "../src/adapters/node/create-better-auth.js";
import { BetterAuthPort } from "../src/adapters/node/better-auth-port.js";
import { resolveTestPhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import { ALLOWLIST_REFUSAL_ERROR } from "../src/auth/allowed-emails.js";
import { AUTH_REFUSAL_MESSAGE } from "../src/http/auth-pages.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import {
  installFakeGoogleFetch,
  handleFakeGoogleRequest,
  isFakeGoogleOAuthPath,
} from "../src/auth/fake-google-http.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0004_ID,
} from "../src/storage/migrations/apply.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import { completeGoogleSignIn } from "./helpers/google-sign-in-flow.js";
import { MIGRATION_0001_SQL } from "./helpers/exercise-sqlite-fixture.js";
import type { AppDependencies } from "../src/http/app.js";
import type { BetterAuthRuntime } from "../src/adapters/node/better-auth-types.js";

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

async function createAuthTestDeps(
  storage: BetterSqliteStorage,
  serverConfig: ReturnType<typeof resolveTestPhysioServerConfig>,
): Promise<AppDependencies> {
  installFakeGoogleFetch(serverConfig.auth.authBaseUrl);
  const options = buildPhysioBetterAuthOptionsForConfig(storage, serverConfig.auth);
  const runtime = betterAuth({
    ...options,
    database: storage.nativeDatabase(),
  }) as BetterAuthRuntime;
  return {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config: serverConfig,
    auth: new BetterAuthPort(runtime, storage, serverConfig.auth),
    mcp: createPhysioMcpHttpHandler(serverConfig),
    fakeGooglePreAuth: handleFakeGoogleRequest,
    extraSessionPublicPath: isFakeGoogleOAuthPath,
  };
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

describe("validateUserInfo via fake Google OAuth (integration)", () => {
  it("writes zero auth rows when fake Google userinfo fails validateUserInfo", async () => {
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
      const deps = await createAuthTestDeps(storage, serverConfig);
      const { lastResponse } = await completeGoogleSignIn(BASE, deps, "refused");
      expect(await lastResponse.text()).toContain(AUTH_REFUSAL_MESSAGE);
      const counts = await countAuthTables(storage);
      expect(counts).toEqual({ user: 0, account: 0, session: 0, verification: 0 });
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
      const deps = await createAuthTestDeps(storage, serverConfig);
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
