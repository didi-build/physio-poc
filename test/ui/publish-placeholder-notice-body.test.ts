import { describe, expect, it } from "vitest";
import type { ProgramBuilderRow } from "../../src/services/programs/types.js";
import { publishPlaceholderNoticeBody } from "../../src/ui/programs/publish-placeholder-notice-body.js";

function placeholderRow(
  id: string,
  state: ProgramBuilderRow["placeholder_state"],
): ProgramBuilderRow {
  return {
    id,
    position: 0,
    kind: "placeholder",
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: "req",
    pinned_version_number: null,
    prescription_type: "stretching",
    params: {},
    params_source: null,
    resolved_params: {},
    resolved_params_source: "global_defaults",
    text_snapshot: { title: "Move" },
    note: null,
    library_update: null,
    exercise_version_choices: [],
    placeholder_state: state,
  };
}

describe("publishPlaceholderNoticeBody (DIDI-1106, CTO 110d77a1)", () => {
  it("returns T19 only when every row is type_mismatch", () => {
    const body = publishPlaceholderNoticeBody([
      placeholderRow("a", "type_mismatch"),
      placeholderRow("b", "type_mismatch"),
    ]);
    expect(body).toBe("Fix or remove the exercises that didn't link, then publish.");
  });

  it("returns approved body plus T18 for mixed lists", () => {
    const body = publishPlaceholderNoticeBody([
      placeholderRow("a", "type_mismatch"),
      placeholderRow("b", "awaiting_approval"),
    ]);
    expect(body).toBe(
      "2 exercises are placeholders. Approve each draft or remove it from this program, then publish. Fix or remove the exercises that didn't link.",
    );
  });

  it("uses plural approved body before T18 when mixed list has more than one row", () => {
    const body = publishPlaceholderNoticeBody([
      placeholderRow("a", "type_mismatch"),
      placeholderRow("b", "awaiting_approval"),
      placeholderRow("c", "awaiting_approval"),
    ]);
    expect(body).toBe(
      "3 exercises are placeholders. Approve each draft or remove it from this program, then publish. Fix or remove the exercises that didn't link.",
    );
  });
});
