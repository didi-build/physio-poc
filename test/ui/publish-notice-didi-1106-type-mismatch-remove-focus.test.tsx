// @vitest-environment jsdom
import "./setup.js";
import { useState, type ReactNode } from "react";
import { cleanup, render, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishSheet } from "../../src/ui/programs/PublishSheet.js";
import { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { PLACEHOLDER_BLOCK_HEADING } from "../../src/ui/copy/program-publish.js";
import { removeRowAriaLabel } from "../../src/ui/copy/programs.js";
import { TYPE_MISMATCH_FIX } from "../../src/ui/copy/program-type-mismatch.js";
import type {
  ProgramBuilderRow,
  ProgramBuilderView,
} from "../../src/services/programs/types.js";

const baseProgram: ProgramBuilderView = {
  program_id: "prog-1",
  code: "AB12CD",
  name: "Program",
  created_at: "2026-01-01T00:00:00.000Z",
  draft_updated_at: "2026-01-01T00:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" },
  draft_saved_at: "2026-01-01T00:00:00.000Z",
  exercise_count: 3,
  library_updates_to_review: 0,
  type_mismatch_placeholder_count: 3,
  rows: [],
  open_share_link: false,
  share_link_status: "none",
  last_sent_at: null,
  deleted_at: null,
  routine_origin: null,
};

function mismatchRow(id: string, title: string, position: number): ProgramBuilderRow {
  return {
    id,
    position,
    kind: "placeholder",
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: `req-${id}`,
    pinned_version_number: null,
    prescription_type: "stretching",
    params: { hold_s: 30 },
    params_source: "global_defaults",
    resolved_params: { hold_s: 30 },
    resolved_params_source: "global_defaults",
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [],
    placeholder_state: "type_mismatch",
    type_mismatch_approved_category: "strengthening",
  };
}

function renderInRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const TITLES = ["Alpha", "Beta", "Gamma"] as const;

describe("Publish notice type-mismatch remove focus DIDI-1106", () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    { remove: "Alpha", expectFocus: "Beta", label: "first row" },
    { remove: "Beta", expectFocus: "Gamma", label: "middle row" },
    { remove: "Gamma", expectFocus: "Beta", label: "last row" },
  ])(
    "keeps builder order and focuses the next Fix control after removing $label",
    async ({ remove, expectFocus }) => {
      const initialRows = TITLES.map((title, index) =>
        mismatchRow(`tm-${index}`, title, index),
      );
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
            showNameField={false}
            onNameChange={() => {}}
            onProgramUpdated={() => {}}
            onClose={() => {}}
            onPublished={() => {}}
            onNotYet={() => {}}
            onRemovePlaceholder={(rowId) => {
              setRows((prev) => prev.filter((row) => row.id !== rowId));
            }}
            onFixTypeMismatch={() => {}}
          />
        );
      }
      const view = renderInRouter(<Harness />);
      const notice = within(view.container).getByRole("status", {
        name: PLACEHOLDER_BLOCK_HEADING,
      });
      const rows = within(notice).getAllByRole("listitem");
      expect(within(rows[0]!).getByText("Alpha")).toBeInTheDocument();
      expect(within(rows[1]!).getByText("Beta")).toBeInTheDocument();
      expect(within(rows[2]!).getByText("Gamma")).toBeInTheDocument();
      const expectRow = rows.find((li) => li.textContent?.includes(expectFocus))!;
      const expectFix = within(expectRow).getByRole("link", {
        name: `Fix for ${expectFocus}`,
      });
      expect(expectFix).toHaveTextContent(TYPE_MISMATCH_FIX);
      await userEvent.click(
        within(notice).getByRole("button", {
          name: removeRowAriaLabel(remove),
        }),
      );
      expect(document.activeElement).toBe(expectFix);
    },
  );
});
