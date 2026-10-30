import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import {
  PhysioPractitionerBindingError,
  bindPractitionerForSessionUser,
  runPhysioUserCreateBeforeHook,
} from "../src/auth/physio-better-auth-hooks.js";
import { resolveTestPhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0004_ID,
} from "../src/storage/migrations/apply.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import { MIGRATION_0001_SQL } from "./helpers/exercise-sqlite-fixture.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const MIGRATION_0004_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0004_better_auth.sql"),
  "utf8",
);

describe("runPhysioUserCreateBeforeHook (unit)", () => {
  it("throws for an unverified email", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET).auth;
      await expect(
        runPhysioUserCreateBeforeHook(storage, config, {
          email: FAKE_GOOGLE_ALLOWED_EMAIL,
          emailVerified: false,
          name: "Kojo",
        }),
      ).rejects.toThrow(PhysioPractitionerBindingError);
    } finally {
      storage.close();
    }
  });

  it("throws for a non-allowlisted email", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET).auth;
      await expect(
        runPhysioUserCreateBeforeHook(storage, config, {
          email: "not.on.allowlist@example.com",
          emailVerified: true,
          name: "Kojo",
        }),
      ).rejects.toThrow(PhysioPractitionerBindingError);
    } finally {
      storage.close();
    }
  });
});

describe("bindPractitionerForSessionUser (unit)", () => {
  it("throws an OAuth allowlist refusal when bound practitionerId disagrees with email lookup", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      const boundId = generateOpaqueEntityId();
      const emailMatchId = generateOpaqueEntityId();
      await storage.run(
        "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
        [boundId, "stale@example.com", "2026-01-01T00:00:00.000Z"],
      );
      await storage.run(
        "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
        [emailMatchId, FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
      );
      const userId = "user-session-bind-test";
      await storage.run(
        `INSERT INTO "user" (
          id, name, email, emailVerified, image, createdAt, updatedAt, practitionerId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          "Kojo",
          FAKE_GOOGLE_ALLOWED_EMAIL,
          1,
          null,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z",
          boundId,
        ],
      );

      await expect(bindPractitionerForSessionUser(storage, { userId })).rejects.toThrow(
        PhysioPractitionerBindingError,
      );
    } finally {
      storage.close();
    }
  });
});
