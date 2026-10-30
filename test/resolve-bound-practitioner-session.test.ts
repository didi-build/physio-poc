import { describe, expect, it } from "vitest";
import { parseAllowedGoogleEmails } from "../src/auth/allowed-emails.js";
import { resolveBoundPractitionerSession } from "../src/auth/resolve-bound-practitioner-session.js";
import type { PhysioAuthConfig } from "../src/http/config.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

function testAuthConfig(allowedRaw: string): PhysioAuthConfig {
  return {
    betterAuthSecret: PHYSIO_TEST_BETTER_AUTH_SECRET,
    googleClientId: "fake",
    googleClientSecret: "fake",
    allowedGoogleEmails: parseAllowedGoogleEmails(allowedRaw),
    fakeGoogleProviderEnabled: true,
    authBaseUrl: "http://127.0.0.1:8787",
  };
}

describe("resolveBoundPractitionerSession (unit)", () => {
  it("rejects when the email is no longer allowlisted", async () => {
    const storage = await openMigratedDatabase();
    const practId = await seedPractitioner(
      storage,
      undefined,
      FAKE_GOOGLE_ALLOWED_EMAIL,
    );
    const config = testAuthConfig("");
    const result = await resolveBoundPractitionerSession(storage, config, {
      email: FAKE_GOOGLE_ALLOWED_EMAIL,
      name: "Kojo",
      boundPractitionerId: practId,
      sessionToken: "tok-1",
    });
    expect(result).toEqual({ ok: false, shouldDeleteSession: true });
  });

  it("rejects when practitioner id binding is missing", async () => {
    const storage = await openMigratedDatabase();
    await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
    const config = testAuthConfig(FAKE_GOOGLE_ALLOWED_EMAIL);
    const result = await resolveBoundPractitionerSession(storage, config, {
      email: FAKE_GOOGLE_ALLOWED_EMAIL,
      name: "Kojo",
      boundPractitionerId: null,
      sessionToken: "tok-2",
    });
    expect(result).toEqual({ ok: false, shouldDeleteSession: true });
  });

  it("rejects when the bound practitioner row is gone", async () => {
    const storage = await openMigratedDatabase();
    const practId = await seedPractitioner(
      storage,
      undefined,
      FAKE_GOOGLE_ALLOWED_EMAIL,
    );
    await storage.run("DELETE FROM practitioners WHERE id = ?", [practId]);
    const config = testAuthConfig(FAKE_GOOGLE_ALLOWED_EMAIL);
    const result = await resolveBoundPractitionerSession(storage, config, {
      email: FAKE_GOOGLE_ALLOWED_EMAIL,
      name: "Kojo",
      boundPractitionerId: practId,
      sessionToken: "tok-3",
    });
    expect(result).toEqual({ ok: false, shouldDeleteSession: true });
  });

  it("rejects when the email maps to a different practitioner id than the binding", async () => {
    const storage = await openMigratedDatabase();
    const oldId = await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
    await storage.run("DELETE FROM practitioners WHERE id = ?", [oldId]);
    const newId = generateOpaqueEntityId();
    await seedPractitioner(storage, newId, FAKE_GOOGLE_ALLOWED_EMAIL);
    const config = testAuthConfig(FAKE_GOOGLE_ALLOWED_EMAIL);
    const result = await resolveBoundPractitionerSession(storage, config, {
      email: FAKE_GOOGLE_ALLOWED_EMAIL,
      name: "Kojo",
      boundPractitionerId: oldId,
      sessionToken: "tok-4",
    });
    expect(result).toEqual({ ok: false, shouldDeleteSession: true });
  });

  it("accepts a consistent allowlist, binding, and practitioner row", async () => {
    const storage = await openMigratedDatabase();
    const practId = await seedPractitioner(
      storage,
      undefined,
      FAKE_GOOGLE_ALLOWED_EMAIL,
    );
    const config = testAuthConfig(FAKE_GOOGLE_ALLOWED_EMAIL);
    const result = await resolveBoundPractitionerSession(storage, config, {
      email: FAKE_GOOGLE_ALLOWED_EMAIL,
      name: "Kojo",
      boundPractitionerId: practId,
      sessionToken: "tok-5",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.practitionerId).toBe(practId);
    }
  });
});
