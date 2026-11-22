import { describe, expect, it, vi } from "vitest";
import type { ProgramMutationWithUndoResult } from "../../src/services/programs/types.js";
import { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { wrapProgramsClientWithCacheInvalidation } from "../../src/ui/api/caching-programs-client.js";
import * as invalidation from "../../src/ui/api/navigation-read-cache-invalidation.js";

function minimalLinkResult(): ProgramMutationWithUndoResult {
  return {
    program: {
      program_id: "prog-w10",
      code: "PRG-W10",
      name: null,
      created_at: "2026-10-24T12:00:00.000Z",
      draft_updated_at: "2026-10-24T12:01:00.000Z",
      auto_save_status: { kind: "not_published_yet" },
      draft_saved_at: "2026-10-24T12:00:00.000Z",
      exercise_count: 1,
      library_updates_to_review: 0,
      type_mismatch_placeholder_count: 0,
      rows: [],
      open_share_link: false,
      share_link_status: "none",
      last_sent_at: null,
      deleted_at: null,
      routine_origin: null,
    },
    undo: {
      kind: "placeholder_type_mismatch_link",
      row_id: "row-w10",
      exercise_request_id: "req-w10",
      prescription_type: "stretching",
      params: {},
      note: null,
      text_snapshot: { title: "Bridge" },
    },
  };
}

describe("DIDI-1106 QA R4 caching programs client (W10)", () => {
  it("W10 forwards linkTypeMismatchPlaceholder through the cache wrapper", async () => {
    const linkTypeMismatchPlaceholder = vi.fn().mockResolvedValue(minimalLinkResult());
    const inner = { linkTypeMismatchPlaceholder } as unknown as ProgramsClient;
    const invalidateSpy = vi
      .spyOn(invalidation, "invalidateAfterProgramBuilderMutation")
      .mockImplementation(() => {});
    try {
      const wrapped = wrapProgramsClientWithCacheInvalidation(inner);
      expect(wrapped.linkTypeMismatchPlaceholder).toBeDefined();
      await wrapped.linkTypeMismatchPlaceholder(
        "prog-w10",
        "row-w10",
        "concentric",
        "2026-10-24T12:00:00.000Z",
      );
      expect(linkTypeMismatchPlaceholder).toHaveBeenCalledWith(
        "prog-w10",
        "row-w10",
        "concentric",
        "2026-10-24T12:00:00.000Z",
      );
      expect(invalidateSpy).toHaveBeenCalledWith("PRG-W10");
    } finally {
      invalidateSpy.mockRestore();
    }
  });

  it("W10 forwards undoTypeMismatchPlaceholderLink through the cache wrapper", async () => {
    const undoTypeMismatchPlaceholderLink = vi.fn().mockResolvedValue({
      program: minimalLinkResult().program,
    });
    const inner = { undoTypeMismatchPlaceholderLink } as unknown as ProgramsClient;
    const invalidateSpy = vi
      .spyOn(invalidation, "invalidateAfterProgramBuilderMutation")
      .mockImplementation(() => {});
    try {
      const wrapped = wrapProgramsClientWithCacheInvalidation(inner);
      expect(wrapped.undoTypeMismatchPlaceholderLink).toBeDefined();
      await wrapped.undoTypeMismatchPlaceholderLink(
        "prog-w10",
        "row-w10",
        "2026-10-24T12:01:00.000Z",
      );
      expect(undoTypeMismatchPlaceholderLink).toHaveBeenCalledWith(
        "prog-w10",
        "row-w10",
        "2026-10-24T12:01:00.000Z",
      );
      expect(invalidateSpy).toHaveBeenCalledWith("PRG-W10");
    } finally {
      invalidateSpy.mockRestore();
    }
  });
});
