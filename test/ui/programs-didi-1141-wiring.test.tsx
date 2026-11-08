/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  BUILT_FROM_SCRATCH,
  FILTER_FROM_SCRATCH,
  PROGRAM_CARD_NO_LINK_YET,
  PROGRAMS_PAGE_TITLE,
} from "../../src/ui/copy/programs.js";
import type {
  ProgramBuilderView,
  ProgramListItem,
} from "../../src/services/programs/types.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
});

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: vi.fn(),
    searchApproved: vi.fn(),
  } as unknown as ExerciseLibraryClient;
}

const LIST_ITEM: ProgramListItem = {
  program_id: "prog-1",
  code: "PRG-TEST",
  name: "Knee program A",
  exercise_count: 2,
  draft_updated_at: "2026-10-24T12:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" },
  library_updates_to_review: 0,
  share_link_status: "none",
  last_sent_at: null,
  deleted_at: null,
  routine_origin: null,
};

function builderView(): ProgramBuilderView {
  return {
    program_id: "prog-1",
    code: "PRG-TEST",
    name: null,
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: 0,
    library_updates_to_review: 0,
    rows: [],
    open_share_link: false,
    share_link_status: "none",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
  };
}

describe("Programs DIDI-1141 wiring (integration, jsdom)", () => {
  it("requests origin filter on the list API when From scratch is selected", async () => {
    const listPrograms = vi
      .fn()
      .mockResolvedValue({ items: [LIST_ITEM], matched_code: null });
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={
            {
              listPrograms,
              listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
              createProgram: vi.fn(),
              getProgram: vi.fn(),
              getProgramByCode: vi.fn(),
              updateProgramName: vi.fn(),
              deleteProgram: vi.fn(),
              restoreProgram: vi.fn(),
              addExerciseRow: vi.fn(),
              reorderRows: vi.fn(),
              duplicateRow: vi.fn(),
              deleteRow: vi.fn(),
              updateRow: vi.fn(),
              applyLibraryUpdate: vi.fn(),
              keepLibraryUpdate: vi.fn(),
              addPlaceholderRow: vi.fn(),
            } as unknown as ProgramsClient
          }
        />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: PROGRAMS_PAGE_TITLE });
    await userEvent.click(screen.getByRole("button", { name: FILTER_FROM_SCRATCH }));
    await waitFor(() => {
      expect(listPrograms).toHaveBeenCalledWith(
        undefined,
        "from_scratch",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it("shows origin and link status on list cards", async () => {
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={
            {
              listPrograms: vi
                .fn()
                .mockResolvedValue({ items: [LIST_ITEM], matched_code: null }),
              listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
              createProgram: vi.fn(),
              getProgram: vi.fn(),
              getProgramByCode: vi.fn(),
              updateProgramName: vi.fn(),
              deleteProgram: vi.fn(),
              restoreProgram: vi.fn(),
              addExerciseRow: vi.fn(),
              reorderRows: vi.fn(),
              duplicateRow: vi.fn(),
              deleteRow: vi.fn(),
              updateRow: vi.fn(),
              applyLibraryUpdate: vi.fn(),
              keepLibraryUpdate: vi.fn(),
              addPlaceholderRow: vi.fn(),
            } as unknown as ProgramsClient
          }
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText(BUILT_FROM_SCRATCH)).toBeInTheDocument();
    expect(screen.getByText(PROGRAM_CARD_NO_LINK_YET)).toBeInTheDocument();
    expect(screen.getByText("2 exercises")).toBeInTheDocument();
  });

  it("PATCHes exercise_version_id when a row version is changed", async () => {
    const updateRow = vi.fn().mockResolvedValue({ program: builderView() });
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={
            {
              listPrograms: vi.fn(),
              listDeletedPrograms: vi.fn(),
              getProgramByCode: vi.fn().mockResolvedValue({
                ...builderView(),
                rows: [
                  {
                    id: "row-1",
                    position: 0,
                    kind: "exercise",
                    exercise_id: "ex-1",
                    exercise_version_id: "v1",
                    exercise_request_id: null,
                    pinned_version_number: 1,
                    prescription_type: "concentric",
                    params: { reps: 10 },
                    params_source: "global_defaults",
                    resolved_params: { reps: 10 },
                    resolved_params_source: "global_defaults",
                    text_snapshot: { title: "Heel raise" },
                    note: null,
                    library_update: null,
                    exercise_version_choices: [
                      { exercise_version_id: "v1", version_number: 1 },
                      { exercise_version_id: "v2", version_number: 2 },
                    ],
                  },
                ],
              }),
              getProgram: vi.fn(),
              updateProgramName: vi.fn(),
              createProgram: vi.fn(),
              deleteProgram: vi.fn(),
              restoreProgram: vi.fn(),
              addExerciseRow: vi.fn(),
              reorderRows: vi.fn(),
              duplicateRow: vi.fn(),
              deleteRow: vi.fn(),
              updateRow,
              applyLibraryUpdate: vi.fn(),
              keepLibraryUpdate: vi.fn(),
              addPlaceholderRow: vi.fn(),
            } as unknown as ProgramsClient
          }
        />
      </MemoryRouter>,
    );
    await userEvent.selectOptions(await screen.findByLabelText("Version"), "2");
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-1", {
        exercise_version_id: "v2",
      });
    });
  });
});
