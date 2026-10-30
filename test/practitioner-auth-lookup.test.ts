import { describe, expect, it } from "vitest";
import { findPractitionerByEmail } from "../src/storage/repositories/practitioner-auth.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";

describe("findPractitionerByEmail (allowlist lookup)", () => {
  it("matches practitioners when the sign-in email uses mixed case", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(
        storage,
        undefined,
        FAKE_GOOGLE_ALLOWED_EMAIL,
      );
      const row = await findPractitionerByEmail(
        storage,
        FAKE_GOOGLE_ALLOWED_EMAIL.toUpperCase(),
      );
      expect(row?.id).toBe(practId);
    } finally {
      storage.close();
    }
  });
});
