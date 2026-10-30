import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import {
  ALLOWLIST_REFUSAL_ERROR,
  isEmailAllowlisted,
} from "../src/auth/allowed-emails.js";
import { buildPhysioBetterAuthOptions } from "../src/adapters/node/create-better-auth.js";
import { BetterAuthPort } from "../src/adapters/node/better-auth-port.js";
import { installFakeGoogleFetch } from "../src/auth/fake-google-http.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import {
  PhysioPractitionerBindingError,
  runPhysioUserCreateBeforeHook,
  runPhysioUserUpdateBeforeHook,
} from "../src/auth/physio-better-auth-hooks.js";
import { resolveTestPhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0004_ID,
} from "../src/storage/migrations/apply.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import { completeGoogleSignIn } from "./helpers/google-sign-in-flow.js";
import { MIGRATION_0001_SQL } from "./helpers/exercise-sqlite-fixture.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import type { BetterAuthRuntime } from "../src/adapters/node/better-auth-types.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const MIGRATION_0004_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0004_better_auth.sql"),
  "utf8",
);
const BASE = "http://127.0.0.1:8787";

async function countAuthTables(
  storage: BetterSqliteStorage,
): Promise<{ user: number; account: number; session: number }> {
  const user =
    (await storage.first<{ c: number }>('SELECT count(*) as c FROM "user"'))?.c ?? 0;
  const account =
    (await storage.first<{ c: number }>('SELECT count(*) as c FROM "account"'))?.c ?? 0;
  const session =
    (await storage.first<{ c: number }>('SELECT count(*) as c FROM "session"'))?.c ?? 0;
  return { user, account, session };
}

function createAllowlistOnlyValidateUserInfo(
  config: ReturnType<typeof resolveTestPhysioServerConfig>["auth"],
) {
  return async ({
    user,
    source,
  }: Parameters<
    NonNullable<
      NonNullable<Parameters<typeof betterAuth>[0]["user"]>["validateUserInfo"]
    >
  >[0]) => {
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
  };
}

function createBetterAuthWithAllowlistOnlyValidateUserInfo(
  storage: BetterSqliteStorage,
  serverConfig: ReturnType<typeof resolveTestPhysioServerConfig>,
) {
  installFakeGoogleFetch(serverConfig.auth.authBaseUrl);
  const auth = betterAuth({
    ...buildPhysioBetterAuthOptions(storage, serverConfig.auth, {
      validateUserInfo: createAllowlistOnlyValidateUserInfo(serverConfig.auth),
    }),
    database: storage.nativeDatabase(),
  });
  return auth as BetterAuthRuntime;
}

describe("runPhysioUserCreateBeforeHook (unit)", () => {
  it("throws before insert when the practitioner row is missing", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET).auth;
      await expect(
        runPhysioUserCreateBeforeHook(storage, config, {
          email: FAKE_GOOGLE_ALLOWED_EMAIL,
          emailVerified: true,
          name: "Kojo",
        }),
      ).rejects.toThrow(PhysioPractitionerBindingError);
    } finally {
      storage.close();
    }
  });
});

describe("OAuth user-create hook fail-closed (integration)", () => {
  it("writes zero auth rows when validateUserInfo skips practitioner check but the create hook rejects", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      const serverConfig = resolveTestPhysioServerConfig(
        PHYSIO_TEST_BETTER_AUTH_SECRET,
        {
          authBaseUrl: BASE,
        },
      );
      const runtime = createBetterAuthWithAllowlistOnlyValidateUserInfo(
        storage,
        serverConfig,
      );
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: serverConfig,
        auth: new BetterAuthPort(runtime, storage, serverConfig.auth),
        mcp: createPhysioMcpHttpHandler(serverConfig),
        enableFakeGoogleRoutes: true,
      };

      const { lastResponse } = await completeGoogleSignIn(BASE, deps, "allowed");
      expect(lastResponse.status).not.toBe(500);
      const counts = await countAuthTables(storage);
      expect(counts).toEqual({ user: 0, account: 0, session: 0 });
    } finally {
      storage.close();
    }
  });
});

describe("Physio user hook stripping (unit)", () => {
  it("strips client practitionerId on create and update without additionalFields input:false", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      const practId = generateOpaqueEntityId();
      await storage.run(
        "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
        [practId, FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
      );
      const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET).auth;
      const attackerId = generateOpaqueEntityId();

      const created = await runPhysioUserCreateBeforeHook(storage, config, {
        email: FAKE_GOOGLE_ALLOWED_EMAIL,
        emailVerified: true,
        name: "Kojo",
        practitionerId: attackerId,
      });
      expect(created.data.practitionerId).toBe(practId);
      expect(created.data.practitionerId).not.toBe(attackerId);

      const updated = await runPhysioUserUpdateBeforeHook({
        name: "Renamed",
        practitionerId: attackerId,
      });
      expect(updated.data).not.toHaveProperty("practitionerId");
    } finally {
      storage.close();
    }
  });
});
