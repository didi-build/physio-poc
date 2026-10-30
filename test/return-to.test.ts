import { describe, expect, it } from "vitest";
import { normalizeReturnTo } from "../src/auth/return-to.js";

describe("normalizeReturnTo", () => {
  it("keeps same-origin relative paths", () => {
    expect(normalizeReturnTo("/programs")).toBe("/programs");
    expect(normalizeReturnTo("/exercises?sort=newest")).toBe("/exercises?sort=newest");
  });

  it("rejects off-site and protocol-relative targets", () => {
    expect(normalizeReturnTo("//evil.example")).toBe("/");
    expect(normalizeReturnTo("https://evil.example/x")).toBe("/");
  });

  it("rejects backslash open redirects", () => {
    expect(normalizeReturnTo("/\\evil.example")).toBe("/");
    expect(normalizeReturnTo("/programs\\@evil.example")).toBe("/");
  });

  it("rejects control characters", () => {
    expect(normalizeReturnTo("/programs\u0000/evil")).toBe("/");
    expect(normalizeReturnTo("/\u007f")).toBe("/");
  });
});
