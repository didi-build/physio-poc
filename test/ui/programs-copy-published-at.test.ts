import { afterEach, describe, expect, it } from "vitest";
import { formatProgramPublishedAt } from "../../src/ui/copy/programs.js";

const FIXED_INSTANT_ISO = "2026-06-15T18:30:00.000Z";

describe("formatProgramPublishedAt (unit)", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it("formats the fixed instant in the viewer time zone (America/Los_Angeles)", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(formatProgramPublishedAt(FIXED_INSTANT_ISO)).toBe("Jun 15, 11:30 AM");
  });

  it("formats the fixed instant in America/Toronto when that is the viewer zone", () => {
    process.env.TZ = "America/Toronto";
    expect(formatProgramPublishedAt(FIXED_INSTANT_ISO)).toBe("Jun 15, 2:30 PM");
  });

  it("returns the input when the ISO string is not parseable", () => {
    expect(formatProgramPublishedAt("not-a-date")).toBe("not-a-date");
  });
});
