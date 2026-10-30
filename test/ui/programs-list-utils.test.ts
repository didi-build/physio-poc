import { describe, expect, it } from "vitest";
import {
  libraryUpdatesToReviewFlag,
  listCountLabel,
} from "../../src/ui/copy/programs.js";
import {
  filterProgramsClientSide,
  resolveProgramIdForBuilderCode,
} from "../../src/ui/programs/programs-list-utils.js";

describe("libraryUpdatesToReviewFlag (unit)", () => {
  it("returns null for zero and the States table line 23 template with N replaced by the count", () => {
    expect(libraryUpdatesToReviewFlag(0)).toBeNull();
    expect(libraryUpdatesToReviewFlag(1)).toBe("1 library updates to review");
    expect(libraryUpdatesToReviewFlag(2)).toBe("2 library updates to review");
  });
});

describe("listCountLabel (unit)", () => {
  it("uses singular and filtered list count copy", () => {
    expect(listCountLabel(1)).toBe("1 program");
    expect(listCountLabel(5, 1)).toBe("1 of 5 programs");
    expect(listCountLabel(5, 0)).toBe("0 of 5 programs");
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
