import { describe, expect, it } from "vitest";
import {
  ShareLinkExpiryValidationError,
  validateCustomLinkExpiryDate,
} from "../src/domain/share-link-expiry.js";

describe("share-link-expiry custom date guard", () => {
  const now = new Date("2026-10-30T00:30:00.000Z");

  it("rejects yesterday and accepts tomorrow in America/Toronto", () => {
    expect(() => validateCustomLinkExpiryDate("2026-10-29", now)).toThrow(
      ShareLinkExpiryValidationError,
    );
    expect(validateCustomLinkExpiryDate("2026-10-30", now)).toBe("2026-10-30");
  });
});
