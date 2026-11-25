import { describe, expect, it } from "vitest";
import {
  DUPLICATE_CONTROL_TITLE,
  PENDING_REVIEW_BADGE,
  ROW_NOTES_PLACEHOLDER,
  exercisesSectionTotalCount,
  libraryVersionAvailableRowBadge,
  builderReorderMovedAnnouncement,
  reorderRowAriaLabel,
  moveProgramRowDownAria,
  moveProgramRowUpAria,
  rowNotesSrOnlyLabel,
} from "../../src/ui/copy/programs.js";

describe("Programs builder row copy (unit)", () => {
  it("matches spec and approved grip string verbatim", () => {
    expect(ROW_NOTES_PLACEHOLDER).toBe("Notes for this exercise (optional)");
    expect(PENDING_REVIEW_BADGE).toBe("Pending review");
    expect(DUPLICATE_CONTROL_TITLE).toBe("Duplicate");
    expect(rowNotesSrOnlyLabel("Heel raise")).toBe("Notes for Heel raise");
    expect(reorderRowAriaLabel("Alpha move", 2)).toBe(
      "Reorder Alpha move, position 2. Press and hold, then drag. Or hold Shift and use the arrow keys.",
    );
    expect(moveProgramRowUpAria("Alpha move")).toBe("Move Alpha move up");
    expect(moveProgramRowDownAria("Beta move")).toBe("Move Beta move down");
    expect(builderReorderMovedAnnouncement("Alpha move", 2, 3)).toBe(
      "Alpha move moved to position 2 of 3",
    );
    expect(exercisesSectionTotalCount(3)).toBe("3 total");
    expect(libraryVersionAvailableRowBadge(4)).toBe("Library v4 available");
  });
});
