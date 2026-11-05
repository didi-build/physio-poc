import { describe, expect, it } from "vitest";
import { scopeForPick } from "../../src/ui/exercise-requests/RegenerateMediaSheet.js";

describe("scopeForPick", () => {
  it("maps general regeneration picks to both image scopes", () => {
    expect(scopeForPick("all")).toBe("both");
    expect(scopeForPick("images")).toBe("both");
  });

  it("rejects video-only picks until the visuals API supports them", () => {
    expect(() => scopeForPick("video")).toThrow(/Video-only regeneration/);
  });
});
