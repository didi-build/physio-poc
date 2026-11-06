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
      }),
    ).toBe("Test Coach");
    expect(
      requestedByLabel({
        requestedBy: practitionerId,
        requestedByEmail: "coach@example.com",
        currentPractitionerId: practitionerId,
        currentDisplayName: undefined,
      }),
    ).toBe("");
  });
});
