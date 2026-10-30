import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import * as resolveBound from "../src/auth/resolve-bound-practitioner-session.js";
import { stripClientPractitionerId } from "../src/auth/better-auth-minimal-storage.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0004_ID,
} from "../src/storage/migrations/apply.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import {
  completeGoogleSignIn,
  countAuthSessions,
  requestWithJar,
  CookieJar,
} from "./helpers/google-sign-in-flow.js";
import {
  MIGRATION_0001_SQL,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const MIGRATION_0004_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0004_better_auth.sql"),
  "utf8",
);

const BASE = "http://127.0.0.1:8787";

async function readUserPractitionerId(
  deps: Awaited<ReturnType<typeof createNodeAppDependencies>>,
): Promise<string | null> {
  const row = await deps.sql.first<{ practitionerId: string | null }>(
    'SELECT "practitionerId" as practitionerId FROM "user" LIMIT 1',
  );
  return row?.practitionerId ?? null;
}

describe("0004 Better Auth practitionerId column (integration)", () => {
  it("rejects user rows whose practitionerId FK does not match practitioners.id", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
      const practId = await seedPractitioner(storage);
      const bogusId = generateOpaqueEntityId();
      expect(bogusId).not.toBe(practId);
      await expect(
        storage.run(
          `INSERT INTO "user" (
            id, name, email, emailVerified, image, createdAt, updatedAt, practitionerId
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "user-fk-test",
            "Test",
            "fk-test@example.com",
            1,
            null,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
            bogusId,
          ],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });
});

describe("Better Auth practitionerId binding guards", () => {
  it("strips practitionerId from user records in storage hooks (client input guard)", () => {
    const attackerId = generateOpaqueEntityId();
    const stripped = stripClientPractitionerId({
      name: "Kojo",
      email: "a@example.com",
      practitionerId: attackerId,
    });
    expect(stripped).not.toHaveProperty("practitionerId");
  });

  it("ignores client-supplied practitionerId on sign-in and update-user", async () => {
    const deps = await createNodeAppDependencies({
      AUTH_BASE_URL: BASE,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: FAKE_GOOGLE_ALLOWED_EMAIL,
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    });
    const practId = generateOpaqueEntityId();
    const attackerId = generateOpaqueEntityId();
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [practId, FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
    );

    const jar = new CookieJar();
    await requestWithJar(BASE, `${BASE}/api/auth/sign-in/social`, deps, jar, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/exercises",
        practitionerId: attackerId,
      }),
    });

    const { jar: signedInJar } = await completeGoogleSignIn(BASE, deps, "allowed");
    expect(await readUserPractitionerId(deps)).toBe(practId);
    expect(await readUserPractitionerId(deps)).not.toBe(attackerId);

    const update = await requestWithJar(
      BASE,
      `${BASE}/api/auth/update-user`,
      deps,
      signedInJar,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Kojo",
          practitionerId: attackerId,
        }),
      },
    );
    expect(update.status).toBeLessThan(500);
    expect(await readUserPractitionerId(deps)).toBe(practId);
    expect(await readUserPractitionerId(deps)).not.toBe(attackerId);
  });

  it("guard: deleteAuthSessionByToken runs when binding resolution fails", async () => {
    const deps = await createNodeAppDependencies({
      AUTH_BASE_URL: BASE,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: FAKE_GOOGLE_ALLOWED_EMAIL,
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    });
    const practId = generateOpaqueEntityId();
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [practId, FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
    );
    const { jar } = await completeGoogleSignIn(BASE, deps, "allowed");

    const deleteSpy = vi.spyOn(resolveBound, "deleteAuthSessionByToken");
    await deps.sql.run("DELETE FROM practitioners WHERE id = ?", [practId]);

    await requestWithJar(
      BASE,
      `${BASE}/api/practitioners/${practId}/my-exercises`,
      deps,
      jar,
    );
    expect(deleteSpy).toHaveBeenCalled();
    deleteSpy.mockRestore();
  });

  it("binds practitionerId from the matching email when multiple practitioner rows exist", async () => {
    const deps = await createNodeAppDependencies({
      AUTH_BASE_URL: BASE,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: FAKE_GOOGLE_ALLOWED_EMAIL,
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    });
    const otherId = generateOpaqueEntityId();
    const allowedId = generateOpaqueEntityId();
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [otherId, "other.practitioner@example.com", "2026-01-01T00:00:00.000Z"],
    );
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [allowedId, FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
    );

    await completeGoogleSignIn(BASE, deps, "allowed");
    expect(await readUserPractitionerId(deps)).toBe(allowedId);
    expect(await readUserPractitionerId(deps)).not.toBe(otherId);
  });

  it("returns null and deletes the session when user.practitionerId disagrees with email lookup", async () => {
    const deps = await createNodeAppDependencies({
      AUTH_BASE_URL: BASE,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: FAKE_GOOGLE_ALLOWED_EMAIL,
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    });
    const practId = generateOpaqueEntityId();
    const wrongId = generateOpaqueEntityId();
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [practId, FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
    );
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [wrongId, "wrong-binding@example.com", "2026-01-01T00:00:00.000Z"],
    );
    const { jar } = await completeGoogleSignIn(BASE, deps, "allowed");
    await deps.sql.run('UPDATE "user" SET "practitionerId" = ? WHERE email = ?', [
      wrongId,
      FAKE_GOOGLE_ALLOWED_EMAIL,
    ]);

    const practitioner = await deps.auth.getPractitioner(
      new Request(`${BASE}/exercises`, { headers: { cookie: jar.header() } }),
    );
    expect(practitioner).toBeNull();
    expect(await countAuthSessions(deps)).toBe(0);
  });
});
