import { describe, expect, it } from "vitest";
import { derivePlaceholderState } from "../src/services/programs/placeholder-state.js";

describe("derivePlaceholderState (DIDI-1106)", () => {
  it("maps drafting and open to awaiting_approval", () => {
    expect(derivePlaceholderState("drafting")).toBe("awaiting_approval");
    expect(derivePlaceholderState("open")).toBe("awaiting_approval");
  });

  it("maps withdrawn to request_closed and approved to type_mismatch", () => {
    expect(derivePlaceholderState("withdrawn")).toBe("request_closed");
    expect(derivePlaceholderState("approved")).toBe("type_mismatch");
  });
});
