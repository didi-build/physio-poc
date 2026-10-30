import { describe, expect, it } from "vitest";
import { sanitizeOAuthClientDisplayName } from "../src/auth/mcp-oauth/sanitize-client-name.js";

describe("sanitizeOAuthClientDisplayName (DIDI-1043)", () => {
  it("applies NFC normalization", () => {
    const decomposed = "cafe\u0301";
    expect(sanitizeOAuthClientDisplayName(decomposed, "example.com")).toBe("café");
  });

  it("strips control characters", () => {
    expect(sanitizeOAuthClientDisplayName("Ko\u0007jo", "example.com")).toBe("Kojo");
  });

  it("strips bidi and zero-width characters", () => {
    expect(sanitizeOAuthClientDisplayName("Ko\u200Bjo\u202E", "example.com")).toBe(
      "Kojo",
    );
  });

  it("caps at 64 characters", () => {
    const long = "a".repeat(80);
    expect(sanitizeOAuthClientDisplayName(long, "example.com")).toHaveLength(64);
  });

  it("falls back to host when empty after sanitization", () => {
    expect(sanitizeOAuthClientDisplayName("\u200B\u0000", "chatgpt.com")).toBe(
      "chatgpt.com",
    );
  });

  it("mutation: removing NFC step would not compose characters", () => {
    const nfc = "e\u0301".normalize("NFC");
    expect(sanitizeOAuthClientDisplayName("e\u0301", "example.com")).toBe(nfc);
  });
});
