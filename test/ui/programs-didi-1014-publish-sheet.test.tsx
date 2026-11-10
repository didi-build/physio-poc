/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishSheet } from "../../src/ui/programs/PublishSheet.js";
import {
  EXPIRY_APPLIES_NEW_LINK,
  PUBLISH_NOW,
  PUBLISH_SHEET_TITLE,
} from "../../src/ui/copy/program-publish.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";
import type { ProgramShareConnectorView } from "../../src/services/programs/program-publish-service.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";

afterEach(() => {
  cleanup();
});

const program: ProgramBuilderView = {
  program_id: "p1",
  code: "PRG-7K3Q",
  name: "",
  created_at: "2026-10-24T12:00:00.000Z",
  draft_updated_at: "2026-10-24T12:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" },
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
  open_share_link: false,
  share_link_status: "none",
  last_sent_at: null,
  deleted_at: null,
  routine_origin: null,
};

const shareView: ProgramShareConnectorView = {
  display_state: "draft_only",
  share_link: "",
  share_link_status: "none",
  share_link_state: "none",
  expires_at: null,
  open_share_link: false,
  draft: { version: 1, updated_at: "2026-10-24T12:00:00.000Z" },
  published: null,
  program_code: "PRG-7K3Q",
  program_name: null,
  link_expires_in: null,
  link_expires_on: null,
  practitioner_default_expires_in: "1_year",
  publish_change_lines: [],
  published_at: null,
};

function PublishSheetHarness() {
  const [nameDraft, setNameDraft] = useState("");
  const client = {
    publishProgram: vi.fn(),
    updateProgramName: vi.fn(),
  } as unknown as ProgramsClient;
  return (
    <PublishSheet
      open
      program={program}
      shareView={shareView}
      client={client}
      nameDraft={nameDraft}
      showNameField
      onNameChange={setNameDraft}
      onProgramUpdated={() => {}}
      onClose={() => {}}
      onPublished={() => {}}
      onNotYet={() => {}}
      onRemovePlaceholder={() => {}}
    />
  );
}

describe("Publish sheet (DIDI-1014)", () => {
  it("keeps Publish now disabled until a program name is provided", async () => {
    render(
      <MemoryRouter>
        <PublishSheetHarness />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
    const publishButton = within(dialog).getByRole("button", { name: PUBLISH_NOW });
    expect(publishButton).toBeDisabled();
    expect(within(dialog).getByText(EXPIRY_APPLIES_NEW_LINK)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /1 year \(default\)/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.type(within(dialog).getByLabelText(/Program name/), "Knee rehab");
    expect(publishButton).not.toBeDisabled();
  });
});
