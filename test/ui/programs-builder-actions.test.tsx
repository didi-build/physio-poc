/**
 * @vitest-environment jsdom
 */
import { ensureMatchMediaStub } from "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  ADD_EXERCISE,
  BUILDER_ROWS_HINT,
  DUPLICATE_CONTROL_TITLE,
  PENDING_REVIEW_BADGE,
  ROW_NOTES_PLACEHOLDER,
  ROW_VERSION_LABEL,
  duplicatedRowToast,
  duplicateRowAriaLabel,
  exercisesSectionTotalCount,
  removeRowAriaLabel,
  rowNotesSrOnlyLabel,
  libraryVersionAvailableRowBadge,
  versionOfRowLabel,
} from "../../src/ui/copy/programs.js";
import { TYPE_LABELS } from "../../src/ui/copy/my-defaults.js";
import type {
  ProgramBuilderRow,
  ProgramBuilderView,
  ProgramListItem,
} from "../../src/services/programs/types.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  vi.unstubAllGlobals();
  ensureMatchMediaStub();
});

const LIST_ITEM: ProgramListItem = {
  program_id: "prog-1",
  code: "PRG-TEST",
  name: "Knee program A",
  exercise_count: 0,
  draft_updated_at: "2026-10-24T12:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" },
  library_updates_to_review: 0,
  share_link_status: "none",
  last_sent_at: null,
  deleted_at: null,
  routine_origin: null,
};

function exerciseRow(id: string, title: string, position: number): ProgramBuilderRow {
  return {
    id,
    position,
    kind: "exercise",
    exercise_id: "ex-1",
    exercise_version_id: "v1",
    exercise_request_id: null,
    pinned_version_number: 1,
    prescription_type: "concentric",
    params: { reps: 10, per_day: 2 },
    params_source: "global_defaults",
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [{ exercise_version_id: "v1", version_number: 1 }],
  };
}

function builderView(overrides: Partial<ProgramBuilderView> = {}): ProgramBuilderView {
  return {
    program_id: "prog-1",
    code: "PRG-TEST",
    name: "Knee program A",
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
    ...overrides,
  };
}

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: vi.fn().mockResolvedValue({
      list_state: "ok",
      sections: {
        new_from_requests: [],
        pinned: [
          {
            exercise_id: "ex-heel",
            exercise_name: "Heel raise",
            category: "Strengthening",
            body_regions: ["Ankle"],
            section: "pinned",
          },
        ],
        recently_used_and_saved: [],
      },
    }),
    searchApproved: vi.fn().mockResolvedValue({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    }),
  } as unknown as ExerciseLibraryClient;
}

function renderBuilder(programsClient: ProgramsClient) {
  render(
    <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        programsClient={programsClient}
      />
    </MemoryRouter>,
  );
}

describe("Programs builder row actions (integration, jsdom)", () => {
  it("adds an exercise with the chosen exercise_id and shows the row", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-row-id" });
    const addExerciseRow = vi.fn().mockImplementation(async () => ({
      program: builderView({
        exercise_count: 1,
        rows: [exerciseRow("row-1", "Heel raise", 0)],
      }),
    }));
    renderBuilder(
      stubProgramsClient({
        addExerciseRow,
        getProgram: vi.fn().mockResolvedValue(builderView()),
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: ADD_EXERCISE }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Add Heel raise" }),
    );
    await waitFor(() => {
      expect(addExerciseRow).toHaveBeenCalledWith("prog-1", {
        row_id: "new-row-id",
        exercise_id: "ex-heel",
      });
    });
    expect(
      await screen.findByRole("heading", { name: "Heel raise", level: 3 }),
    ).toBeInTheDocument();
  });

  it("reorders rows with ordered_row_ids from move down", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
    ];
    const reorderRows = vi.fn().mockImplementation(async (_id, ordered) => ({
      program: builderView({
        rows: ordered.map((id: string, position: number) =>
          id === "row-a"
            ? exerciseRow("row-a", "Alpha move", position)
            : exerciseRow("row-b", "Beta move", position),
        ),
      }),
    }));
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 2 })),
        reorderRows,
      }),
    );
    const alphaCard = await screen.findByRole("article", { name: /Alpha move/i });
    alphaCard.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(reorderRows).toHaveBeenCalledWith("prog-1", ["row-b", "row-a"]);
    });
    expect(
      screen.getByRole("heading", { name: "Beta move", level: 3 }),
    ).toBeInTheDocument();
  });

  it("reorders rows with ordered_row_ids from move up (X12)", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
    ];
    const reorderRows = vi.fn().mockImplementation(async (_id, ordered) => ({
      program: builderView({
        rows: ordered.map((id: string, position: number) =>
          id === "row-a"
            ? exerciseRow("row-a", "Alpha move", position)
            : exerciseRow("row-b", "Beta move", position),
        ),
      }),
    }));
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 2 })),
        reorderRows,
      }),
    );
    const betaCard = await screen.findByRole("article", { name: /Beta move/i });
    betaCard.focus();
    await userEvent.keyboard("{ArrowUp}");
    await waitFor(() => {
      expect(reorderRows).toHaveBeenCalledWith("prog-1", ["row-b", "row-a"]);
    });
    expect(
      screen.getByRole("heading", { name: "Alpha move", level: 3 }),
    ).toBeInTheDocument();
  });

  it("duplicates a row and shows the duplicated toast", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "dup-row-id" });
    const rows = [exerciseRow("row-a", "Alpha move", 0)];
    const duplicateRow = vi.fn().mockImplementation(async () => ({
      program: builderView({
        exercise_count: 2,
        rows: [
          exerciseRow("row-a", "Alpha move", 0),
          exerciseRow("dup-row-id", "Alpha move", 1),
        ],
      }),
    }));
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 1 })),
        duplicateRow,
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: duplicateRowAriaLabel("Alpha move"),
      }),
    );
    await waitFor(() => {
      expect(duplicateRow).toHaveBeenCalledWith("prog-1", "row-a", "dup-row-id");
    });
    expect(
      await screen.findByText(duplicatedRowToast("Alpha move")),
    ).toBeInTheDocument();
  });

  it("removes a row via deleteRow", async () => {
    const rows = [exerciseRow("row-a", "Alpha move", 0)];
    const deleteRow = vi.fn().mockImplementation(async () => ({
      program: builderView({ rows: [], exercise_count: 0 }),
    }));
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 1 })),
        deleteRow,
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: removeRowAriaLabel("Alpha move"),
      }),
    );
    await waitFor(() => {
      expect(deleteRow).toHaveBeenCalledWith("prog-1", "row-a");
    });
    expect(
      screen.queryByRole("heading", { name: "Alpha move", level: 3 }),
    ).not.toBeInTheDocument();
  });
});

describe("Program builder row card layout (integration, jsdom)", () => {
  it("M6: applies stripe classes for strength, stretching, and placeholder rows", async () => {
    const placeholder: ProgramBuilderRow = {
      ...exerciseRow("row-ph", "Pending exercise", 0),
      kind: "placeholder",
      exercise_id: null,
      exercise_version_id: null,
      pinned_version_number: null,
      exercise_version_choices: [],
    };
    const stretchMove: ProgramBuilderRow = {
      ...exerciseRow("row-st", "Stretch move", 1),
      prescription_type: "stretching",
    };
    const strengthMove = exerciseRow("row-stg", "Strength move", 2);
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(
          builderView({
            rows: [placeholder, stretchMove, strengthMove],
            exercise_count: 2,
          }),
        ),
      }),
    );
    const pendingCard = await screen.findByRole("article", {
      name: /Pending exercise/i,
    });
    expect(pendingCard).toHaveClass("pg-row", "pg-row--stripe-pending");
    const stretchCard = screen.getByRole("article", { name: /Stretch move/i });
    expect(stretchCard).toHaveClass("pg-row", "pg-row--stripe-sky");
    const strengthCard = screen.getByRole("article", { name: /Strength move/i });
    expect(strengthCard).toHaveClass("pg-row", "pg-row--stripe-violet");
  });

  it("M7: shows Isometric or Concentric or Eccentric control only on strength rows", async () => {
    const stretchMove: ProgramBuilderRow = {
      ...exerciseRow("row-st", "Stretch move", 0),
      prescription_type: "stretching",
    };
    const strengthMove = exerciseRow("row-stg", "Strength move", 1);
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(
            builderView({ rows: [stretchMove, strengthMove], exercise_count: 2 }),
          ),
      }),
    );
    await screen.findByRole("article", { name: /Stretch move/i });
    const stretchCard = screen.getByRole("article", { name: /Stretch move/i });
    expect(within(stretchCard).queryByRole("radiogroup")).not.toBeInTheDocument();
    const strengthCard = screen.getByRole("article", { name: /Strength move/i });
    const typeGroup = within(strengthCard).getByRole("radiogroup");
    expect(typeGroup).toBeInTheDocument();
    expect(
      within(typeGroup).getByRole("radio", { name: "Isometric" }),
    ).toBeInTheDocument();
    expect(
      within(typeGroup).getByRole("radio", { name: "Concentric" }),
    ).toBeInTheDocument();
    expect(
      within(typeGroup).getByRole("radio", { name: "Eccentric" }),
    ).toBeInTheDocument();
  });

  it("M8: shows the grey dose readout box and no dose Adjust control", async () => {
    const strengthMove = exerciseRow("row-stg", "Strength move", 0);
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [strengthMove], exercise_count: 1 })),
      }),
    );
    const strengthCard = await screen.findByRole("article", { name: /Strength move/i });
    const doseBox = within(strengthCard)
      .getByText(/10 reps/)
      .closest(".pg-row-dose-box");
    expect(doseBox).toBeTruthy();
    expect(screen.queryByText(/Adjust/i)).not.toBeInTheDocument();
  });
});

describe("Programs builder v12 rendered copy (integration, jsdom)", () => {
  it("shows exercises heading total including 0 total", async () => {
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView()),
      }),
    );
    expect(await screen.findByText(exercisesSectionTotalCount(0))).toBeInTheDocument();
  });

  it("shows reorder hint with grip icon", async () => {
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView()),
      }),
    );
    expect(await screen.findByText(BUILDER_ROWS_HINT)).toBeInTheDocument();
    const hint = screen.getByText(BUILDER_ROWS_HINT).closest(".pg-rows-hint");
    expect(hint?.querySelector(".pg-rows-hint-grip")).toBeTruthy();
  });

  it("shows Pending review, Library badge from data, TYPE_LABELS category, notes input, Duplicate title", async () => {
    const withLibrary: ProgramBuilderRow = {
      ...exerciseRow("row-lib", "Library row", 0),
      library_update: {
        row_id: "row-lib",
        exercise_id: "ex-1",
        exercise_title: "Library row",
        pinned_version_number: 1,
        latest_version_number: 2,
      },
    };
    const noLibrary = exerciseRow("row-plain", "Plain move", 1);
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(
            builderView({ rows: [withLibrary, noLibrary], exercise_count: 2 }),
          ),
      }),
    );
    expect(await screen.findByText(exercisesSectionTotalCount(2))).toBeInTheDocument();
    const libCard = screen.getByRole("article", { name: /Library row/i });
    expect(within(libCard).queryByText(PENDING_REVIEW_BADGE)).not.toBeInTheDocument();
    expect(
      within(libCard).getByText(libraryVersionAvailableRowBadge(2)),
    ).toBeInTheDocument();
    expect(
      within(libCard).getByText(TYPE_LABELS.concentric, {
        selector: ".pg-row-cat-label",
      }),
    ).toBeInTheDocument();
    const libDup = within(libCard).getByRole("button", {
      name: duplicateRowAriaLabel("Library row"),
    });
    expect(libDup).toHaveAttribute("title", DUPLICATE_CONTROL_TITLE);
    const libNotes = within(libCard).getByRole("textbox", {
      name: rowNotesSrOnlyLabel("Library row"),
    });
    expect(libNotes.tagName).toBe("INPUT");
    expect(libNotes).toHaveAttribute("placeholder", ROW_NOTES_PLACEHOLDER);
    expect(libCard.querySelector("textarea")).toBeNull();

    const plainCard = screen.getByRole("article", { name: /Plain move/i });
    expect(
      within(plainCard).queryByText(/Library v\d+ available/),
    ).not.toBeInTheDocument();
  });

  it("shows Pending review and dose box on placeholder rows", async () => {
    const row: ProgramBuilderRow = {
      ...exerciseRow("ph-1", "Bridge marching", 0),
      kind: "placeholder",
      exercise_id: null,
      exercise_version_id: null,
      pinned_version_number: null,
      prescription_type: "concentric",
      exercise_version_choices: [{ exercise_version_id: "v-ph", version_number: 1 }],
    };
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows: [row] })),
      }),
    );
    const card = await screen.findByRole("article", { name: /Bridge marching/i });
    expect(within(card).getByText(PENDING_REVIEW_BADGE)).toBeInTheDocument();
    expect(card.querySelector(".pg-row-cat-line")).toBeNull();
    expect(
      within(card).queryByRole("combobox", { name: ROW_VERSION_LABEL }),
    ).toBeNull();
    expect(card.querySelector(".pg-row-version")).toBeNull();
    expect(
      within(card)
        .getByText(/10 reps/)
        .closest(".pg-row-dose-box"),
    ).toBeTruthy();
    expect(
      within(card).getByRole("radiogroup", {
        name: versionOfRowLabel("Bridge marching"),
      }),
    ).toBeInTheDocument();
  });
});

function stubProgramsClient(overrides: Partial<ProgramsClient> = {}): ProgramsClient {
  const base: Partial<ProgramsClient> = {
    listPrograms: vi.fn().mockResolvedValue({
      items: [LIST_ITEM],
      matched_code: "PRG-TEST",
    }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    createProgram: vi.fn(),
    getProgram: vi.fn().mockResolvedValue(builderView()),
    getProgramByCode: vi.fn().mockResolvedValue(builderView()),
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
  };
  const merged = { ...base, ...overrides } as ProgramsClient;
  if (overrides.getProgram && !overrides.getProgramByCode) {
    merged.getProgramByCode =
      overrides.getProgram as ProgramsClient["getProgramByCode"];
  }
  return merged;
}
