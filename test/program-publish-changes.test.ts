import { describe, expect, it } from "vitest";
import { PUBLISH_CHANGE_TITLE_CHANGED } from "../src/copy/program-publish-messages.js";
import { computeProgramPublishChangeLines } from "../src/services/programs/program-publish-changes.js";
import type { ProgramBuilderView } from "../src/services/programs/types.js";
import type { PublishedProgramSnapshot } from "../src/domain/program-types.js";

const baseProgram: ProgramBuilderView = {
  program_id: "p1",
  code: "PRG-1",
  name: "Knee rehab",
  created_at: "2026-10-24T12:00:00.000Z",
  draft_updated_at: "2026-10-24T12:00:00.000Z",
  auto_save_status: { kind: "unpublished_changes" },
  draft_saved_at: "2026-10-24T12:00:00.000Z",
  exercise_count: 1,
  library_updates_to_review: 0,
  rows: [
    {
      id: "r1",
      position: 0,
      kind: "exercise",
      exercise_id: "ex1",
      exercise_version_id: "v1",
      exercise_request_id: null,
      pinned_version_number: 1,
      prescription_type: "stretching",
      params: { hold_s: 30 },
      params_source: "global_defaults",
      resolved_params: { hold_s: 30 },
      resolved_params_source: "global_defaults",
      text_snapshot: { title: "Heel slide" },
      note: null,
      library_update: null,
      exercise_version_choices: [],
    },
  ],
  open_share_link: true,
  share_link_status: "open",
  last_sent_at: "2026-10-24T12:00:00.000Z",
  deleted_at: null,
  routine_origin: null,
};

describe("computeProgramPublishChangeLines (unit)", () => {
  it("returns nothing on first publish when no snapshot exists", () => {
    expect(
      computeProgramPublishChangeLines({
        program: baseProgram,
        publishedSnapshot: null,
      }),
    ).toEqual([]);
  });

  it("detects a title change against the published snapshot", () => {
    const snapshot: PublishedProgramSnapshot = {
      version: 1,
      name: "Old name",
      publishedAt: "2026-10-20T12:00:00.000Z",
      rows: [
        {
          position: 0,
          exerciseId: "ex1",
          exerciseVersionId: "v1",
          exerciseRequestId: null,
          prescriptionType: "stretching",
          params: { hold_s: 30 },
          textSnapshot: { title: "Heel slide" },
          note: null,
        },
      ],
    };
    const lines = computeProgramPublishChangeLines({
      program: baseProgram,
      publishedSnapshot: snapshot,
    });
    expect(lines).toContain(PUBLISH_CHANGE_TITLE_CHANGED);
  });
});
