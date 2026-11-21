import { describe, expect, it } from "vitest";
import { scopeForPick } from "../../src/ui/exercise-requests/RegenerateMediaSheet.js";

describe("scopeForPick", () => {
  it("maps general image regeneration picks to both scopes", () => {
    expect(scopeForPick("images")).toBe("both");
  });
});
