import { afterEach, describe, expect, it } from "vitest";
import {
  PROGRAM_CARD_LINK_CLOSED_KEEP,
  PROGRAM_CARD_NO_LINK_YET,
  formatProgramSentListDate,
  programCardCountAndSentLine,
  programCardLinkStatusLine,
} from "../../src/ui/copy/programs.js";

describe("program list card copy helpers (unit)", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it("formats sent list dates as month and day only", () => {
    process.env.TZ = "America/Toronto";
    expect(formatProgramSentListDate("2026-10-24T12:00:00.000Z")).toBe("Oct 24");
  });

  it("builds count and sent lines from spec inventory", () => {
    expect(programCardCountAndSentLine(0, null)).toBe("No exercises yet");
    expect(programCardCountAndSentLine(6, "2026-10-24T12:00:00.000Z")).toBe(
      "6 exercises · Sent Oct 24",
    );
  });

  it("maps share link status to approved list card copy", () => {
    expect(programCardLinkStatusLine("none")).toBe(PROGRAM_CARD_NO_LINK_YET);
    expect(programCardLinkStatusLine("closed")).toBe(PROGRAM_CARD_LINK_CLOSED_KEEP);
    expect(programCardLinkStatusLine("open")).toBeNull();
  });
});
