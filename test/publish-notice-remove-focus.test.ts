import { describe, expect, it } from "vitest";
import { nextRemoveButtonIndex } from "../src/ui/programs/publish-notice-remove-focus.js";

describe("publish notice remove focus", () => {
  it("moves focus to the next row", () => {
    expect(nextRemoveButtonIndex(0, 2)).toBe(0);
    expect(nextRemoveButtonIndex(1, 2)).toBe(1);
  });

  it("moves focus to the previous row when the last row was removed", () => {
    expect(nextRemoveButtonIndex(2, 2)).toBe(1);
  });
});
