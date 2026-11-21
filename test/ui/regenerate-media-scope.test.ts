import { describe, expect, it } from "vitest";
import { scopeForPick } from "../../src/ui/exercise-requests/RegenerateMediaSheet.js";

describe("scopeForPick", () => {
  it("maps general regeneration picks to both image scopes", () => {
    expect(scopeForPick("all")).toBe("both");
    expect(scopeForPick("images")).toBe("both");
  });

  it("rejects text-only picks until regenerate text is wired on the sheet confirm", () => {
    expect(() => scopeForPick("text")).toThrow(/Text-only regeneration/);
  });
});
