import { describe, expect, it } from "vitest";
import { fullFormatsDate } from "../src/services/mcp/generated/runtime/ajv-formats-date.js";

describe("vendored ajv-formats date helper", () => {
  it("rejects day 00 and accepts a valid leap day", () => {
    expect(fullFormatsDate.validate("2027-01-00")).toBe(false);
    expect(fullFormatsDate.validate("2024-02-29")).toBe(true);
  });

  it("rejects invalid leap day on a non-leap year", () => {
    expect(fullFormatsDate.validate("2023-02-29")).toBe(false);
  });
});
