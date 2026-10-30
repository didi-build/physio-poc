import { describe, expect, it } from "vitest";
import { libraryUpdatesToReviewFlag } from "../../src/ui/copy/programs.js";
import {
  filterProgramsClientSide,
  resolveProgramIdForBuilderCode,
} from "../../src/ui/programs/programs-list-utils.js";

describe("libraryUpdatesToReviewFlag (unit)", () => {
  it("returns null for zero and the States table line 23 pattern when count is positive", () => {
    expect(libraryUpdatesToReviewFlag(0)).toBeNull();
    expect(libraryUpdatesToReviewFlag(2)).toBe("2 library updates to review");
  });
});

describe("programs list utils", () => {
  it("accepts exact matched_code and item code only", () => {
    const result = resolveProgramIdForBuilderCode(
      {
        matched_code: "PRG-ABC",
        items: [
          {
            program_id: "p1",
            code: "PRG-ABC",
            name: "Knee program A",
            exercise_count: 0,
            draft_updated_at: "2026-01-01",
            auto_save_status: { kind: "not_published_yet" },
            library_updates_to_review: 0,
            deleted_at: null,
            routine_origin: null,
          },
        ],
      },
      "PRG-ABC",
    );
    expect(result).toBe("p1");
  });

  it("rejects fuzzy matched_code without exact item code", () => {
    const result = resolveProgramIdForBuilderCode(
      {
        matched_code: "PRG-ABC",
        items: [
          {
            program_id: "p1",
            code: "PRG-ABCD",
            name: "Other",
            exercise_count: 0,
            draft_updated_at: "2026-01-01",
            auto_save_status: { kind: "not_published_yet" },
            library_updates_to_review: 0,
            deleted_at: null,
            routine_origin: null,
          },
        ],
      },
      "PRG-ABC",
    );
    expect(result).toBeNull();
  });

  it("filters client-side by name and code", () => {
    const items = [
      {
        program_id: "p1",
        code: "PRG-ONE",
        name: "Knee program A",
        exercise_count: 1,
        draft_updated_at: "2026-01-01",
        auto_save_status: { kind: "not_published_yet" as const },
        library_updates_to_review: 0,
        deleted_at: null,
        routine_origin: null,
      },
    ];
    expect(filterProgramsClientSide(items, "knee")).toHaveLength(1);
    expect(filterProgramsClientSide(items, "PRG-ONE")).toHaveLength(1);
    expect(filterProgramsClientSide(items, "nomatch")).toHaveLength(0);
  });
});
