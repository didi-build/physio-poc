import { describe, expect, it } from "vitest";
import {
  isEmailAllowlisted,
  parseAllowedGoogleEmails,
} from "../src/auth/allowed-emails.js";

describe("isEmailAllowlisted (unit)", () => {
  it("lowercases the email before lookup", () => {
    const allowlist = parseAllowedGoogleEmails("Coach@Example.com");
    expect(isEmailAllowlisted(allowlist, "coach@example.com")).toBe(true);
    expect(isEmailAllowlisted(allowlist, "COACH@EXAMPLE.COM")).toBe(true);
  });

  it("returns false for empty or whitespace email", () => {
    const allowlist = parseAllowedGoogleEmails("a@example.com");
    expect(isEmailAllowlisted(allowlist, "")).toBe(false);
    expect(isEmailAllowlisted(allowlist, "   ")).toBe(false);
    expect(isEmailAllowlisted(allowlist, null)).toBe(false);
  });
});
