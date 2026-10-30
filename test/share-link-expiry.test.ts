import { describe, expect, it } from "vitest";
import {
  ShareLinkExpiryValidationError,
  validateCustomLinkExpiryDate,
} from "../src/domain/share-link-expiry.js";

describe("share-link-expiry custom date guard", () => {
  const now = new Date("2026-10-30T00:30:00.000Z");

  it("rejects yesterday in America/Toronto (2026-10-28)", () => {
    expect(() => validateCustomLinkExpiryDate("2026-10-28", now)).toThrow(
      ShareLinkExpiryValidationError,
    );
  });

  it("rejects today in America/Toronto (2026-10-29)", () => {
    expect(() => validateCustomLinkExpiryDate("2026-10-29", now)).toThrow(
      ShareLinkExpiryValidationError,
    );
  });

  it("accepts tomorrow in America/Toronto (2026-10-30)", () => {
    expect(validateCustomLinkExpiryDate("2026-10-30", now)).toBe("2026-10-30");
  });
});
