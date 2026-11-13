// @vitest-environment jsdom
import { useState, type ReactNode } from "react";
import { cleanup, render, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishSheet } from "../../src/ui/programs/PublishSheet.js";
import { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { PLACEHOLDER_BLOCK_HEADING } from "../../src/ui/copy/program-publish.js";
import { removeRowAriaLabel } from "../../src/ui/copy/programs.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";
import { RoutinePublishSheet } from "../../src/ui/routines/RoutinePublishSheet.js";
import type { RoutineExerciseRow } from "../../src/services/routines/types.js";

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
  rows: [],
  open_share_link: false,
  share_link_status: "none",
  last_sent_at: null,
  deleted_at: null,
  routine_origin: null,
};

function placeholderRow(id: string, title: string, position: number) {
  return {
    id,
    position,
    kind: "placeholder" as const,
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: `req-${id}`,
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

function exerciseRow(id: string, title: string, position: number, lacksMedia: boolean) {
  return {
    id,
    position,
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

function routineRow(
  position: number,
  name: string,
  lacks: boolean,
): RoutineExerciseRow {
  return {
    position,
    exercise_id: `ex-${position}`,
    exercise_version_id: `ver-${position}`,
    exercise_name: name,
    prescription_type: "stretching",
    params: { hold_s: 30 },
    lacks_start_or_end_image: lacks,
  };
}

function renderInRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const PLACEHOLDER_TITLES = ["Alpha", "Beta", "Gamma"] as const;
const MISSING_TITLES = ["One", "Two", "Three"] as const;
const ROUTINE_TITLES = ["Squat", "Lunge", "Bridge"] as const;

describe("Publish notice remove focus DIDI-1193", () => {
  afterEach(() => {
    cleanup();
  });

  describe("program missing-images notice", () => {
    it.each([
      { remove: "One", expectFocus: "Two", label: "first row" },
      { remove: "Two", expectFocus: "Three", label: "middle row" },
      { remove: "Three", expectFocus: "Two", label: "last row" },
    ])(
      "focuses the next row Remove after removing $label",
      async ({ remove, expectFocus }) => {
        const initialRows = MISSING_TITLES.map((title, index) =>
          exerciseRow(`row-${index}`, title, index, true),
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
        const notice = within(view.container).getByTestId(
          "publish-missing-images-notice",
        );
        const nextRemove = within(notice).getByRole("button", {
          name: removeRowAriaLabel(expectFocus),
        });
        await userEvent.click(
          within(notice).getByRole("button", {
            name: removeRowAriaLabel(remove),
          }),
        );
        expect(document.activeElement).toBe(nextRemove);
      },
    );
  });

  describe("program placeholder notice", () => {
    it.each([
      { remove: "Alpha", expectFocus: "Beta", label: "first row" },
      { remove: "Beta", expectFocus: "Gamma", label: "middle row" },
      { remove: "Gamma", expectFocus: "Beta", label: "last row" },
    ])(
      "focuses the next Review draft link after removing $label",
      async ({ remove, expectFocus }) => {
        const initialRows = PLACEHOLDER_TITLES.map((title, index) =>
          placeholderRow(`ph-${index}`, title, index),
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
              showNameField
              onNameChange={() => {}}
              onProgramUpdated={() => {}}
              onClose={() => {}}
              onPublished={() => {}}
              onNotYet={() => {}}
              onRemovePlaceholder={(rowId) => {
                setRows((prev) => prev.filter((row) => row.id !== rowId));
              }}
            />
          );
        }
        const view = renderInRouter(<Harness />);
        const notice = within(view.container).getByRole("status", {
          name: PLACEHOLDER_BLOCK_HEADING,
        });
        const removeButton = within(notice).getByRole("button", {
          name: removeRowAriaLabel(remove),
        });
        const rows = within(notice).getAllByRole("listitem");
        const expectRow = rows.find((li) => li.textContent?.includes(expectFocus))!;
        const expectLink = expectRow.querySelector(
          "a.pg-link-btn",
        ) as HTMLAnchorElement;
        expect(expectLink).toBeTruthy();
        await userEvent.click(removeButton);
        expect(document.activeElement).toBe(expectLink);
      },
    );
  });

  describe("routine missing-images notice", () => {
    it.each([
      { remove: "Squat", expectFocus: "Lunge", label: "first row" },
      { remove: "Lunge", expectFocus: "Bridge", label: "middle row" },
      { remove: "Bridge", expectFocus: "Lunge", label: "last row" },
    ])(
      "focuses the next row Remove after removing $label",
      async ({ remove, expectFocus }) => {
        const initialRows = ROUTINE_TITLES.map((title, index) =>
          routineRow(index, title, true),
        );
        function Harness() {
          const [rows, setRows] = useState(initialRows);
          return (
            <RoutinePublishSheet
              open
              name="Routine"
              bodyRegionLabel="Knee"
              conditionLabel={null}
              rows={rows}
              publishBusy={false}
              onClose={() => {}}
              onPublish={() => {}}
              onNotYet={() => {}}
              onRemoveMissingImagesRow={(position) => {
                setRows((prev) => prev.filter((row) => row.position !== position));
              }}
            />
          );
        }
        const view = renderInRouter(<Harness />);
        const notice = within(view.container).getByTestId(
          "routine-publish-missing-images-notice",
        );
        const nextRemove = within(notice).getByRole("button", {
          name: removeRowAriaLabel(expectFocus),
        });
        await userEvent.click(
          within(notice).getByRole("button", {
            name: removeRowAriaLabel(remove),
          }),
        );
        expect(document.activeElement).toBe(nextRemove);
      },
    );
  });
});
