import { describe, expect, it } from "vitest";
import {
  parseAllowedGoogleEmails,
  isEmailAllowlisted,
} from "../src/auth/allowed-emails.js";
import { resolveBoundPractitionerSession } from "../src/auth/resolve-bound-practitioner-session.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { PRACTITIONER_SESSION_API_PATH } from "../src/practitioner-session-api-paths.js";
import { rejectQueryPractitionerId } from "../src/http/reject-query-practitioner-id.js";

/**
 * Breadth guard: DIDI-1172 adds read-only session identity for the UI shell.
 * Allowlist and ownership checks stay the same; this file pins the unchanged rules.
 */
describe("account session identity ownership and allowlist breadth (unchanged)", () => {
  it("still normalizes allowlist entries the same way", () => {
    const allowlist = parseAllowedGoogleEmails("Coach@Example.com");
    expect(isEmailAllowlisted(allowlist, "coach@example.com")).toBe(true);
    expect(isEmailAllowlisted(allowlist, "not-listed@example.com")).toBe(false);
  });

  it("still rejects sessions when email is no longer allowlisted", async () => {
    const storage = await openMigratedDatabase();
    const id = testOpaqueEntityId("breadth-allowlist");
    await seedPractitioner(storage, id, "removed@example.com");
    const config = {
      ...MCP_TEST_CONFIG.auth,
      allowedGoogleEmails: new Set<string>(),
    };
    const result = await resolveBoundPractitionerSession(storage, config, {
      email: "removed@example.com",
      name: "Removed Coach",
      boundPractitionerId: id,
      sessionToken: "token",
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected refusal");
    }
    expect(result.shouldDeleteSession).toBe(true);
  });

  it("still rejects practitionerId query params on the new session route", () => {
    const url = new URL(
      `https://physio.test.example${PRACTITIONER_SESSION_API_PATH}?practitionerId=11111111-1111-4111-8111-111111111111`,
    );
    const rejected = rejectQueryPractitionerId(url);
    expect(rejected).not.toBeNull();
    expect(rejected?.status).toBe(400);
  });
});
