/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import "../../src/ui/styles/programs.css";
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
import type {
  ProgramBuilderRow,
  ProgramBuilderView,
} from "../../src/services/programs/types.js";
import { mockMinWidth1024 } from "./setup.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  vi.restoreAllMocks();
});

const GRIP_ALPHA_POSITION_1 =
  "Reorder Alpha move, position 1. Press and hold, then drag. Or hold Shift and use the arrow keys.";
const GRIP_BETA_POSITION_2 =
  "Reorder Beta move, position 2. Press and hold, then drag. Or hold Shift and use the arrow keys.";
const MOVE_ALPHA_UP = "Move Alpha move up";
const MOVE_BETA_DOWN = "Move Beta move down";
const MOVED_ALPHA_POSITION_2_OF_2 = "Alpha move moved to position 2 of 2";
const MOVED_BETA_POSITION_1_OF_2 = "Beta move moved to position 1 of 2";

function exerciseRow(id: string, title: string, position: number): ProgramBuilderRow {
  const params = { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 };
  return {
    id,
    position,
    kind: "exercise",
    exercise_id: "ex-1",
    exercise_version_id: "v1",
    exercise_request_id: null,
    pinned_version_number: 1,
    prescription_type: "concentric",
    params,
    params_source: "global_defaults",
    resolved_params: params,
    resolved_params_source: "global_defaults",
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
    type_mismatch_placeholder_count: 0,
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
      sections: { new_from_requests: [], pinned: [], recently_used_and_saved: [] },
    }),
    searchApproved: vi.fn().mockResolvedValue({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    }),
  } as unknown as ExerciseLibraryClient;
}

function stubProgramsClient(overrides: Partial<ProgramsClient> = {}): ProgramsClient {
  const base: Partial<ProgramsClient> = {
    listPrograms: vi.fn().mockResolvedValue({
      items: [],
      matched_code: "PRG-TEST",
    }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    getProgram: vi.fn().mockResolvedValue(builderView()),
    getProgramByCode: vi.fn().mockResolvedValue(builderView()),
    updateProgramName: vi.fn(),
    deleteProgram: vi.fn(),
    addExerciseRow: vi.fn(),
    reorderRows: vi.fn(),
    duplicateRow: vi.fn(),
    deleteRow: vi.fn(),
    updateRow: vi.fn(),
    applyLibraryUpdate: vi.fn(),
    keepLibraryUpdate: vi.fn(),
  };
  const merged = { ...base, ...overrides } as ProgramsClient;
  if (overrides.getProgram && !overrides.getProgramByCode) {
    merged.getProgramByCode =
      overrides.getProgram as ProgramsClient["getProgramByCode"];
  }
  return merged;
}

function renderBuilder(programsClient: ProgramsClient, widthPx: number) {
  mockMinWidth1024(widthPx >= 1024);
  const container = document.createElement("div");
  container.style.width = `${widthPx}px`;
  document.body.appendChild(container);
  return render(
    <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        programsClient={programsClient}
      />
    </MemoryRouter>,
    { container },
  );
}

describe.each([390, 1280])("Programs builder reorder (DIDI-1166, %i px)", (widthPx) => {
  it("reorders with Shift+ArrowDown on the grip and announces the move", async () => {
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
        exercise_count: 2,
      }),
    }));
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 2 })),
        reorderRows,
      }),
      widthPx,
    );
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    await userEvent.click(grip);
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    await waitFor(() => {
      expect(reorderRows).toHaveBeenCalledWith("prog-1", ["row-b", "row-a"]);
    });
    await waitFor(() => {
      expect(screen.getByText(MOVED_ALPHA_POSITION_2_OF_2)).toBeInTheDocument();
    });
  });

  it("does not reorder when plain ArrowDown is pressed on the grip", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
    ];
    const reorderRows = vi.fn();
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 2 })),
        reorderRows,
      }),
      widthPx,
    );
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    await userEvent.click(grip);
    await userEvent.keyboard("{ArrowDown}");
    expect(reorderRows).not.toHaveBeenCalled();
  });

  it("does not reorder when Shift+ArrowDown is used inside the notes field", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
    ];
    const reorderRows = vi.fn();
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 2 })),
        reorderRows,
      }),
      widthPx,
    );
    const alphaCard = await screen.findByRole("article", { name: /Alpha move/i });
    const notes = within(alphaCard).getByRole("textbox");
    await userEvent.click(notes);
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(reorderRows).not.toHaveBeenCalled();
  });

  it("omits end screen-reader move actions and keeps them hidden", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
    ];
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 2 })),
      }),
      widthPx,
    );
    const alphaCard = await screen.findByRole("article", { name: /Alpha move/i });
    const betaCard = await screen.findByRole("article", { name: /Beta move/i });
    expect(
      within(alphaCard).queryByRole("button", { name: MOVE_ALPHA_UP }),
    ).not.toBeInTheDocument();
    const betaDown = within(betaCard).queryByRole("button", {
      name: MOVE_BETA_DOWN,
    });
    expect(betaDown).not.toBeInTheDocument();
    const betaUp = within(betaCard).getByRole("button", { name: "Move Beta move up" });
    expect(betaUp).toHaveClass("sr-only");
    expect(betaUp).toHaveAttribute("tabindex", "-1");
    const box = betaUp.getBoundingClientRect();
    expect(box.width).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThanOrEqual(1);
  });

  it("reorders via the screen-reader Move up action", async () => {
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
        exercise_count: 2,
      }),
    }));
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 2 })),
        reorderRows,
      }),
      widthPx,
    );
    const betaCard = await screen.findByRole("article", { name: /Beta move/i });
    await userEvent.click(
      within(betaCard).getByRole("button", { name: "Move Beta move up" }),
    );
    await waitFor(() => {
      expect(reorderRows).toHaveBeenCalledWith("prog-1", ["row-b", "row-a"]);
    });
    await waitFor(() => {
      expect(screen.getByText(MOVED_BETA_POSITION_1_OF_2)).toBeInTheDocument();
    });
  });

  it("exposes the grip as a focusable control with the approved name", async () => {
    const rows = [exerciseRow("row-a", "Alpha move", 0)];
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 1 })),
      }),
      widthPx,
    );
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    expect(grip).toHaveClass("pg-row-grip-btn");
    expect(grip.querySelector("svg")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: GRIP_BETA_POSITION_2 }),
    ).not.toBeInTheDocument();
  });
});
