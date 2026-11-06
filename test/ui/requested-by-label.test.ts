import { describe, expect, it } from "vitest";
import { requestedByLabel } from "../../src/ui/exercise-requests/requested-by-label.js";

describe("requestedByLabel", () => {
  it("uses the session display name for the current practitioner, not email local part", () => {
    const practitionerId = "00000000-0000-4000-8000-000000000099";
    expect(
      requestedByLabel({
        requestedBy: practitionerId,
        requestedByEmail: "coach@example.com",
        currentPractitionerId: practitionerId,
        currentDisplayName: "Test Coach",
        sessionIdentityReady: true,
      }),
    ).toBe("Test Coach");
    expect(
      requestedByLabel({
        requestedBy: practitionerId,
        requestedByEmail: "coach@example.com",
        currentPractitionerId: practitionerId,
        currentDisplayName: undefined,
        sessionIdentityReady: true,
      }),
    ).toBe("");
  });

  it("returns empty until session identity is ready so email never appears as fallback", () => {
    const practitionerId = "00000000-0000-4000-8000-000000000099";
    expect(
      requestedByLabel({
        requestedBy: practitionerId,
        requestedByEmail: "coach@example.com",
        currentPractitionerId: practitionerId,
        currentDisplayName: "Test Coach",
        sessionIdentityReady: false,
      }),
    ).toBe("");
  });

  it("shows other requester as capitalised local part when session is ready", () => {
    expect(
      requestedByLabel({
        requestedBy: "other-pract-id",
        requestedByEmail: "other.person@example.com",
        currentPractitionerId: "me-pract-id",
        currentDisplayName: "Me",
        sessionIdentityReady: true,
      }),
    ).toBe("Other.person");
  });
});
