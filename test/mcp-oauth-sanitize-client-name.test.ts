import { describe, expect, it } from "vitest";
import {
  countGraphemes,
  sanitizeOAuthClientDisplayName,
} from "../src/auth/mcp-oauth/sanitize-client-name.js";

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

  it("strips bidi isolate code points U+2066 through U+2069", () => {
    expect(
      sanitizeOAuthClientDisplayName("A\u2066B\u2067C\u2068D\u2069E", "example.com"),
    ).toBe("ABCDE");
  });

  it("strips Arabic letter mark U+061C", () => {
    expect(sanitizeOAuthClientDisplayName("A\u061CB", "example.com")).toBe("AB");
  });

  it("caps at 64 graphemes without splitting emoji", () => {
    const emoji = "😀";
    const long = emoji.repeat(80);
    const sanitized = sanitizeOAuthClientDisplayName(long, "example.com");
    expect(countGraphemes(sanitized)).toBe(64);
    expect(sanitized).toBe(emoji.repeat(64));
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

  it("mutation: dropping bidi isolate stripping would keep U+2066", () => {
    expect(sanitizeOAuthClientDisplayName("x\u2066y", "example.com")).not.toContain(
      "\u2066",
    );
  });
});
