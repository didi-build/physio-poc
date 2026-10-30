/**
 * @vitest-environment jsdom
 */
import "./setup.js";
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
  duplicatedRowToast,
  duplicateRowAriaLabel,
  removeRowAriaLabel,
} from "../../src/ui/copy/programs.js";
import type {
  ProgramBuilderRow,
  ProgramBuilderView,
  ProgramListItem,
} from "../../src/services/programs/types.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  vi.unstubAllGlobals();
});

const LIST_ITEM: ProgramListItem = {
  program_id: "prog-1",
  code: "PRG-TEST",
  name: "Knee program A",
  exercise_count: 0,
  draft_updated_at: "2026-10-24T12:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" },
  library_updates_to_review: 0,
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
    await userEvent.click(
      within(alphaCard).getByRole("button", {
        name: /Reorder Alpha move, position 2/,
      }),
    );
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
    await userEvent.click(
      within(betaCard).getByRole("button", {
        name: /Reorder Beta move, position 2/,
      }),
    );
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

function stubProgramsClient(overrides: Partial<ProgramsClient> = {}): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({
      items: [LIST_ITEM],
      matched_code: "PRG-TEST",
    }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    createProgram: vi.fn(),
    getProgram: vi.fn().mockResolvedValue(builderView()),
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
    ...overrides,
  } as unknown as ProgramsClient;
}
