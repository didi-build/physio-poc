// @vitest-environment jsdom
import { useState, type ReactNode } from "react";
import { cleanup, render, within, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishSheet } from "../../src/ui/programs/PublishSheet.js";
import { ProgramsApiError, ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  MISSING_IMAGES_BLOCK_HEADING,
  PLACEHOLDER_BLOCK_HEADING,
} from "../../src/ui/copy/program-publish.js";
import { PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE } from "../../src/storage/repositories/programs.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";

function exerciseRow(id: string, title: string, lacksMedia: boolean) {
  return {
    id,
    position: 0,
    kind: "exercise" as const,
    exercise_id: "ex-1",
    exercise_version_id: "ver-1",
    exercise_request_id: null,
    pinned_version_number: 1,
    prescription_type: "stretching" as const,
    params: { hold_s: 30 },
    params_source: "global_defaults" as const,
    resolved_params: { hold_s: 30 },
    resolved_params_source: "global_defaults" as const,
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [],
    lacks_start_or_end_image: lacksMedia,
  };
}

function placeholderRow(id: string, title: string, position: number) {
  return {
    id,
    position,
    kind: "placeholder" as const,
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: "req-1",
    pinned_version_number: null,
    prescription_type: "stretching" as const,
    params: { hold_s: 30 },
    params_source: "global_defaults" as const,
    resolved_params: { hold_s: 30 },
    resolved_params_source: "global_defaults" as const,
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [],
  };
}

const baseProgram: ProgramBuilderView = {
  program_id: "prog-1",
  code: "AB12CD",
  name: "Program",
  created_at: "2026-01-01T00:00:00.000Z",
  draft_updated_at: "2026-01-01T00:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" },
  draft_saved_at: "2026-01-01T00:00:00.000Z",
  exercise_count: 2,
  library_updates_to_review: 0,
  rows: [],
  open_share_link: false,
  share_link_status: "none",
  last_sent_at: null,
  deleted_at: null,
  routine_origin: null,
};

function renderInRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Publish sheet missing images accessibility DIDI-1193", () => {
  afterEach(() => {
    cleanup();
  });

  it("drops notice ids from aria-describedby once each list is empty", async () => {
    const initialRows = [
      placeholderRow("ph-1", "Pending", 0),
      { ...exerciseRow("row-a", "Alpha", true), position: 1 },
      { ...exerciseRow("row-b", "Beta", true), position: 2 },
    ];
    function Harness() {
      const [rows, setRows] = useState(initialRows);
      const program: ProgramBuilderView = { ...baseProgram, rows };
      return (
        <PublishSheet
          open
          program={program}
          shareView={null}
          client={new ProgramsClient({ fetchFn: vi.fn() })}
          nameDraft="Program"
          showNameField
          onNameChange={() => {}}
          onProgramUpdated={() => {}}
          onClose={() => {}}
          onPublished={() => {}}
          onNotYet={() => {}}
          onRemovePlaceholder={(rowId) => {
            setRows((prev) => prev.filter((row) => row.id !== rowId));
          }}
          onRemoveMissingImagesRow={(rowId) => {
            setRows((prev) => prev.filter((row) => row.id !== rowId));
          }}
        />
      );
    }
    const view = renderInRouter(<Harness />);
    const publishNow = within(view.container)
      .getAllByRole("button", { name: "Publish now" })
      .find((button) => button.classList.contains("pg-btn--primary"))!;
    expect(
      (publishNow.getAttribute("aria-describedby") ?? "").split(/\s+/).length,
    ).toBe(2);
    await userEvent.click(
      within(view.container).getByRole("button", { name: "Remove Pending" }),
    );
    await waitFor(() => {
      expect(
        (publishNow.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)
          .length,
      ).toBe(1);
    });
    await userEvent.click(
      within(view.container).getByRole("button", { name: "Remove Alpha" }),
    );
    expect(
      (publishNow.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)
        .length,
    ).toBe(1);
    await userEvent.click(
      within(view.container).getByRole("button", { name: "Remove Beta" }),
    );
    expect(publishNow.getAttribute("aria-describedby")).toBeNull();
  });

  it("stacks placeholder notice above missing images when server returns placeholders_block_publish", async () => {
    const program: ProgramBuilderView = {
      ...baseProgram,
      rows: [
        placeholderRow("ph-1", "Pending", 0),
        { ...exerciseRow("row-1", "Heel slide", true), position: 1 },
      ],
    };
    const client = new ProgramsClient({ fetchFn: vi.fn() });
    vi.spyOn(client, "publishProgram").mockRejectedValue(
      new ProgramsApiError(
        "placeholders_block_publish",
        PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
      ),
    );
    const view = renderInRouter(
      <PublishSheet
        open
        program={program}
        shareView={null}
        client={client}
        nameDraft="Program"
        showNameField
        onNameChange={() => {}}
        onProgramUpdated={() => {}}
        onClose={() => {}}
        onPublished={() => {}}
        onNotYet={() => {}}
        onRemovePlaceholder={() => {}}
      />,
    );
    const publishNow = within(view.container)
      .getAllByRole("button", { name: "Publish now" })
      .find((button) => button.classList.contains("pg-btn--primary"))!;
    expect(
      within(view.container).getByRole("heading", { name: PLACEHOLDER_BLOCK_HEADING }),
    ).toBeTruthy();
    expect(
      within(view.container).getByRole("heading", {
        name: MISSING_IMAGES_BLOCK_HEADING,
      }),
    ).toBeTruthy();
    await userEvent.click(publishNow);
    const headings = within(view.container).getAllByRole("heading");
    const placeholderIdx = headings.findIndex(
      (node) => node.textContent === PLACEHOLDER_BLOCK_HEADING,
    );
    const missingIdx = headings.findIndex(
      (node) => node.textContent === MISSING_IMAGES_BLOCK_HEADING,
    );
    expect(placeholderIdx).toBeGreaterThanOrEqual(0);
    expect(missingIdx).toBeGreaterThanOrEqual(0);
    expect(placeholderIdx).toBeLessThan(missingIdx);
  });

  it("focuses the next row Remove button after removing a middle row", async () => {
    const initialRows = [
      { ...exerciseRow("row-a", "Alpha", true), position: 0 },
      { ...exerciseRow("row-b", "Beta", true), position: 1 },
      { ...exerciseRow("row-c", "Gamma", true), position: 2 },
    ];
    function Harness() {
      const [rows, setRows] = useState(initialRows);
      const program: ProgramBuilderView = { ...baseProgram, rows };
      return (
        <PublishSheet
          open
          program={program}
          shareView={null}
          client={new ProgramsClient({ fetchFn: vi.fn() })}
          nameDraft="Program"
          showNameField
          onNameChange={() => {}}
          onProgramUpdated={() => {}}
          onClose={() => {}}
          onPublished={() => {}}
          onNotYet={() => {}}
          onRemovePlaceholder={() => {}}
          onRemoveMissingImagesRow={(rowId) => {
            setRows((prev) => prev.filter((row) => row.id !== rowId));
          }}
        />
      );
    }
    const view = renderInRouter(<Harness />);
    const notice = within(view.container).getByTestId("publish-missing-images-notice");
    const nextRemove = within(notice).getByRole("button", { name: "Remove Gamma" });
    await userEvent.click(within(notice).getByRole("button", { name: "Remove Beta" }));
    expect(document.activeElement).toBe(nextRemove);
  });

  it("moves focus to the missing-images heading on server rejection", async () => {
    const programWithMedia = {
      ...baseProgram,
      rows: [exerciseRow("row-1", "Heel slide", false)],
    };
    const client = new ProgramsClient({ fetchFn: vi.fn() });
    vi.spyOn(client, "publishProgram").mockRejectedValue(
      new ProgramsApiError(
        "missing_images_block_publish",
        MISSING_IMAGES_BLOCK_HEADING,
      ),
    );
    vi.spyOn(client, "getProgramByCode").mockResolvedValue({
      ...programWithMedia,
      rows: [exerciseRow("row-1", "Heel slide", true)],
    });
    const view = renderInRouter(
      <PublishSheet
        open
        program={programWithMedia}
        shareView={null}
        client={client}
        nameDraft="Program"
        showNameField
        onNameChange={() => {}}
        onProgramUpdated={() => {}}
        onClose={() => {}}
        onPublished={() => {}}
        onNotYet={() => {}}
        onRemovePlaceholder={() => {}}
      />,
    );
    const publishNow = within(view.container)
      .getAllByRole("button", { name: "Publish now" })
      .find((button) => button.classList.contains("pg-btn--primary"))!;
    await userEvent.click(publishNow);
    const notice = await within(view.container).findByTestId(
      "publish-missing-images-notice",
    );
    const heading = within(notice).getByRole("heading", {
      name: MISSING_IMAGES_BLOCK_HEADING,
    });
    expect(document.activeElement).toBe(heading);
  });
});
