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

  it("formats a spring DST boundary instant in America/Toronto", () => {
    process.env.TZ = "America/Toronto";
    expect(formatProgramPublishedAt("2026-03-08T06:59:00.000Z")).toBe("Mar 8, 1:59 AM");
    expect(formatProgramPublishedAt("2026-03-08T07:00:00.000Z")).toBe("Mar 8, 3:00 AM");
  });

  it("formats a fall DST boundary instant in America/Toronto", () => {
    process.env.TZ = "America/Toronto";
    expect(formatProgramPublishedAt("2026-11-01T05:30:00.000Z")).toBe("Nov 1, 1:30 AM");
    expect(formatProgramPublishedAt("2026-11-01T06:30:00.000Z")).toBe("Nov 1, 1:30 AM");
  });

  it("returns the input when the ISO string is not parseable", () => {
    expect(formatProgramPublishedAt("not-a-date")).toBe("not-a-date");
  });
});
