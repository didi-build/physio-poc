/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import "../../src/ui/styles/programs.css";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import {
  BUILDER_ROWS_HINT,
  ROW_NOTES_PLACEHOLDER,
  builderReorderDraggingStatus,
} from "../../src/ui/copy/programs.js";
import {
  BUILDER_REORDER_EDGE_SCROLL_PX,
  BUILDER_REORDER_TOUCH_HOLD_MS,
  BUILDER_REORDER_TOUCH_SLOP_PX,
  builderReorderEdgeScrollDelta,
} from "../../src/ui/programs/program-builder-row-reorder.js";
import { mockMinWidth1024 } from "./setup.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  vi.restoreAllMocks();
});

const GRIP_ALPHA_POSITION_1 =
  "Reorder Alpha move, position 1. Press and hold, then drag. Or hold Shift and use the arrow keys.";
const GRIP_ALPHA_POSITION_2 =
  "Reorder Alpha move, position 2. Press and hold, then drag. Or hold Shift and use the arrow keys.";
const GRIP_BETA_POSITION_1 =
  "Reorder Beta move, position 1. Press and hold, then drag. Or hold Shift and use the arrow keys.";
const GRIP_BETA_POSITION_2 =
  "Reorder Beta move, position 2. Press and hold, then drag. Or hold Shift and use the arrow keys.";
const DUPLICATE_BETA = "Duplicate Beta move";
const REMOVE_BETA = "Remove Beta move";
const TOUCH_HOLD_MS = 280;
const TOUCH_SLOP_PX = 8;
const GRIP_GAMMA_POSITION_3 =
  "Reorder Gamma move, position 3. Press and hold, then drag. Or hold Shift and use the arrow keys.";
const MOVE_ALPHA_UP = "Move Alpha move up";
const MOVE_BETA_DOWN = "Move Beta move down";
const MOVE_BETA_UP = "Move Beta move up";
const MOVED_ALPHA_POSITION_2_OF_2 = "Alpha move moved to position 2 of 2";
const MOVED_BETA_POSITION_1_OF_2 = "Beta move moved to position 1 of 2";
const MOVING_ALPHA_PLACE_1 = "Moving Alpha move. Release to drop it in place 1.";

function reorderLiveRegion(): HTMLElement | null {
  return screen.queryByTestId("pg-reorder-live-region");
}

function rowTitlesInDomOrder(): string[] {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((node) => node.textContent ?? "");
}

async function liftRowWithMouse(grip: HTMLElement) {
  fireEvent.pointerDown(grip, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: 20,
    clientY: 20,
    isPrimary: true,
  });
  fireEvent.pointerMove(grip, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: 20,
    clientY: 30,
    isPrimary: true,
  });
  await waitFor(() => {
    expect(document.querySelector(".pg-rows-drag-status")).not.toBeNull();
  });
}

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
    const live = reorderLiveRegion();
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe(MOVED_ALPHA_POSITION_2_OF_2);
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute(
        "aria-label",
        GRIP_ALPHA_POSITION_2,
      );
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

  it("does not reorder at list ends with Shift+arrow on the grip", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
      exerciseRow("row-c", "Gamma move", 2),
    ];
    const reorderRows = vi.fn();
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 3 })),
        reorderRows,
      }),
      widthPx,
    );
    const firstGrip = await screen.findByRole("button", {
      name: GRIP_ALPHA_POSITION_1,
    });
    await userEvent.click(firstGrip);
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    const lastGrip = await screen.findByRole("button", { name: GRIP_GAMMA_POSITION_3 });
    await userEvent.click(lastGrip);
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
    expect(within(alphaCard).queryByRole("button", { name: MOVE_ALPHA_UP })).toBeNull();
    expect(within(betaCard).queryByRole("button", { name: MOVE_BETA_DOWN })).toBeNull();
    const betaUp = within(betaCard).queryByRole("button", { name: MOVE_BETA_UP });
    expect(betaUp).not.toBeNull();
    expect(betaUp).toHaveClass("sr-only");
    expect(betaUp).toHaveAttribute("tabindex", "-1");
    const box = betaUp!.getBoundingClientRect();
    expect(box.width).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThanOrEqual(1);
  });

  it("reorders via the screen-reader Move up action and announces", async () => {
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
    const moveUp = within(betaCard).queryByRole("button", { name: MOVE_BETA_UP });
    expect(moveUp).not.toBeNull();
    await userEvent.click(moveUp!);
    await waitFor(() => {
      expect(reorderRows).toHaveBeenCalledWith("prog-1", ["row-b", "row-a"]);
    });
    const live = reorderLiveRegion();
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe(MOVED_BETA_POSITION_1_OF_2);
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute(
        "aria-label",
        GRIP_BETA_POSITION_1,
      );
    });
  });

  it("reorders via pointer drag drop and announces", async () => {
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
    fireEvent.pointerDown(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 20,
      isPrimary: true,
    });
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 30,
      isPrimary: true,
    });
    await waitFor(() => {
      expect(document.querySelector(".pg-rows-drag-status")).not.toBeNull();
    });
    const betaCard = await screen.findByRole("article", { name: /Beta move/i });
    const alphaCard = await screen.findByRole("article", { name: /Alpha move/i });
    vi.spyOn(betaCard, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 120,
      top: 120,
      left: 0,
      bottom: 200,
      right: 300,
      width: 300,
      height: 80,
      toJSON: () => ({}),
    });
    vi.spyOn(alphaCard, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 40,
      top: 40,
      left: 0,
      bottom: 120,
      right: 300,
      width: 300,
      height: 80,
      toJSON: () => ({}),
    });
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 170,
      isPrimary: true,
    });
    fireEvent.pointerUp(grip, { pointerId: 1, pointerType: "mouse", isPrimary: true });
    await waitFor(() => {
      expect(reorderRows).toHaveBeenCalledWith("prog-1", ["row-b", "row-a"]);
    });
    const live = reorderLiveRegion();
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe(MOVED_ALPHA_POSITION_2_OF_2);
  });

  it("shows the dragging status line while a row is lifted with the mouse", async () => {
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
    fireEvent.pointerDown(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 20,
      isPrimary: true,
    });
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 30,
      isPrimary: true,
    });
    const statusLine = document.querySelector(".pg-rows-drag-status");
    expect(statusLine).not.toBeNull();
    expect(statusLine?.textContent).toBe(MOVING_ALPHA_PLACE_1);
    expect(statusLine?.textContent).toBe(builderReorderDraggingStatus("Alpha move", 1));
    fireEvent.pointerUp(grip, { pointerId: 1, pointerType: "mouse", isPrimary: true });
    expect(reorderRows).not.toHaveBeenCalled();
  });

  it("cancels a lift on Escape over another slot without saving", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
      exerciseRow("row-c", "Gamma move", 2),
    ];
    const reorderRows = vi.fn();
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 3 })),
        reorderRows,
      }),
      widthPx,
    );
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    const gammaCard = await screen.findByRole("article", { name: /Gamma move/i });
    vi.spyOn(gammaCard, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 200,
      top: 200,
      left: 0,
      bottom: 280,
      right: 300,
      width: 300,
      height: 80,
      toJSON: () => ({}),
    });
    await liftRowWithMouse(grip);
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 250,
      isPrimary: true,
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(reorderRows).not.toHaveBeenCalled();
    expect(rowTitlesInDomOrder()).toEqual(["Alpha move", "Beta move", "Gamma move"]);
    expect(document.querySelector(".pg-rows-drag-status")).toBeNull();
    expect(screen.getByText(BUILDER_ROWS_HINT)).toBeInTheDocument();
  });

  it("shows exactly one drop line at the insertion slot while dragging", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
      exerciseRow("row-c", "Gamma move", 2),
    ];
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 3 })),
      }),
      widthPx,
    );
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    const gammaCard = await screen.findByRole("article", { name: /Gamma move/i });
    vi.spyOn(gammaCard, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 200,
      top: 200,
      left: 0,
      bottom: 280,
      right: 300,
      width: 300,
      height: 80,
      toJSON: () => ({}),
    });
    await liftRowWithMouse(grip);
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 250,
      isPrimary: true,
    });
    await waitFor(() => {
      expect(screen.getAllByTestId("pg-row-drop-line")).toHaveLength(1);
    });
  });

  it("does not save row order when the pointer is cancelled mid-drag", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
      exerciseRow("row-c", "Gamma move", 2),
    ];
    const reorderRows = vi.fn();
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 3 })),
        reorderRows,
      }),
      widthPx,
    );
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    const gammaCard = await screen.findByRole("article", { name: /Gamma move/i });
    vi.spyOn(gammaCard, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 200,
      top: 200,
      left: 0,
      bottom: 280,
      right: 300,
      width: 300,
      height: 80,
      toJSON: () => ({}),
    });
    await liftRowWithMouse(grip);
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 250,
      isPrimary: true,
    });
    fireEvent.pointerCancel(grip, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    expect(reorderRows).not.toHaveBeenCalled();
    expect(rowTitlesInDomOrder()).toEqual(["Alpha move", "Beta move", "Gamma move"]);
  });

  it("lifts a touch drag after 280 ms without movement beyond 8 px slop", async () => {
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
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(grip, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 20,
        clientY: 20,
        isPrimary: true,
      });
      await act(async () => {
        vi.advanceTimersByTime(TOUCH_HOLD_MS - 1);
      });
      expect(document.querySelector(".pg-rows-drag-status")).toBeNull();
      expect(BUILDER_REORDER_TOUCH_HOLD_MS).toBe(TOUCH_HOLD_MS);
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(BUILDER_REORDER_TOUCH_SLOP_PX).toBe(TOUCH_SLOP_PX);
      expect(document.querySelector(".pg-rows-drag-status")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a touch press when movement exceeds 8 px slop before 280 ms", async () => {
    const rows = [exerciseRow("row-a", "Alpha move", 0)];
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 1 })),
      }),
      widthPx,
    );
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(grip, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 20,
        clientY: 20,
        isPrimary: true,
      });
      fireEvent.pointerMove(grip, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 20,
        clientY: 20 + TOUCH_SLOP_PX + 1,
        isPrimary: true,
      });
      await act(async () => {
        vi.advanceTimersByTime(TOUCH_HOLD_MS);
      });
      expect(document.querySelector(".pg-rows-drag-status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores Shift+arrow while a reorder save is in flight and keeps the grip focused", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
    ];
    let resolveReorder: ((value: { program: ProgramBuilderView }) => void) | undefined;
    const reorderRows = vi.fn().mockImplementation(
      () =>
        new Promise<{ program: ProgramBuilderView }>((resolve) => {
          resolveReorder = resolve;
        }),
    );
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
      expect(reorderRows).toHaveBeenCalledTimes(1);
    });
    expect(grip).not.toBeDisabled();
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(reorderRows).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(grip);
    resolveReorder?.({
      program: builderView({
        rows: [
          exerciseRow("row-b", "Beta move", 0),
          exerciseRow("row-a", "Alpha move", 1),
        ],
        exercise_count: 2,
      }),
    });
  });

  it("hides Duplicate, Remove and notes on compact peer rows while another row is lifted", async () => {
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
    const alphaGrip = await screen.findByRole("button", {
      name: GRIP_ALPHA_POSITION_1,
    });
    await liftRowWithMouse(alphaGrip);
    const betaCard = await screen.findByRole("article", { name: /Beta move/i });
    expect(within(betaCard).queryByRole("button", { name: DUPLICATE_BETA })).toBeNull();
    expect(within(betaCard).queryByRole("button", { name: REMOVE_BETA })).toBeNull();
    expect(within(betaCard).queryByPlaceholderText(ROW_NOTES_PLACEHOLDER)).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(
        within(betaCard).queryByRole("button", { name: DUPLICATE_BETA }),
      ).not.toBeNull();
    });
    expect(
      within(betaCard).queryByRole("button", { name: REMOVE_BETA }),
    ).not.toBeNull();
    expect(
      within(betaCard).queryByPlaceholderText(ROW_NOTES_PLACEHOLDER),
    ).not.toBeNull();
  });

  it("keeps auto-scrolling while the pointer is held still in the bottom edge band", async () => {
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
    const bar = await screen.findByTestId("pg-builder-bottom-action-bar");
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 400,
      top: 400,
      left: 0,
      bottom: 460,
      right: 300,
      width: 300,
      height: 60,
      toJSON: () => ({}),
    });
    const scrollBy = vi.spyOn(window, "scrollBy");
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    await liftRowWithMouse(grip);
    const clientY = 430;
    expect(
      builderReorderEdgeScrollDelta(clientY, 400, BUILDER_REORDER_EDGE_SCROLL_PX),
    ).toBeGreaterThan(0);
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY,
      isPrimary: true,
    });
    const tickCount = 3;
    await act(async () => {
      for (let i = 0; i < tickCount; i += 1) {
        const pending = [...rafCallbacks];
        rafCallbacks.length = 0;
        for (const cb of pending) {
          cb(0);
        }
      }
    });
    expect(scrollBy.mock.calls.length).toBeGreaterThanOrEqual(tickCount);
    rafSpy.mockRestore();
    scrollBy.mockRestore();
  });

  it("counts a pointer over the bottom action bar as inside the bottom edge band", () => {
    const barTop = 400;
    const overBar = 420;
    expect(
      builderReorderEdgeScrollDelta(overBar, barTop, BUILDER_REORDER_EDGE_SCROLL_PX),
    ).toBeGreaterThan(0);
  });

  it("stops auto-scroll when the pointer leaves the edge band", async () => {
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
    const bar = await screen.findByTestId("pg-builder-bottom-action-bar");
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 400,
      top: 400,
      left: 0,
      bottom: 460,
      right: 300,
      width: 300,
      height: 60,
      toJSON: () => ({}),
    });
    const scrollBy = vi.spyOn(window, "scrollBy");
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    await liftRowWithMouse(grip);
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 430,
      isPrimary: true,
    });
    await act(async () => {
      const cb = rafCallbacks.shift();
      cb?.(0);
    });
    const callsAfterEdge = scrollBy.mock.calls.length;
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 200,
      isPrimary: true,
    });
    await act(async () => {
      const cb = rafCallbacks.shift();
      cb?.(0);
    });
    expect(scrollBy.mock.calls.length).toBe(callsAfterEdge);
    scrollBy.mockRestore();
  });

  it("stops auto-scroll on drop, Escape, and pointercancel", async () => {
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
    const bar = await screen.findByTestId("pg-builder-bottom-action-bar");
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 400,
      top: 400,
      left: 0,
      bottom: 460,
      right: 300,
      width: 300,
      height: 60,
      toJSON: () => ({}),
    });
    const scrollBy = vi.spyOn(window, "scrollBy");
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    await liftRowWithMouse(grip);
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 430,
      isPrimary: true,
    });
    await act(async () => {
      const cb = rafCallbacks.shift();
      cb?.(0);
    });
    const callsBeforeStop = scrollBy.mock.calls.length;
    expect(callsBeforeStop).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: "Escape" });
    await act(async () => {
      const cb = rafCallbacks.shift();
      cb?.(0);
    });
    expect(scrollBy.mock.calls.length).toBe(callsBeforeStop);

    await liftRowWithMouse(grip);
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 430,
      isPrimary: true,
    });
    fireEvent.pointerCancel(grip, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    await act(async () => {
      const cb = rafCallbacks.shift();
      cb?.(0);
    });
    const callsAfterCancel = scrollBy.mock.calls.length;
    await liftRowWithMouse(grip);
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 430,
      isPrimary: true,
    });
    fireEvent.pointerUp(grip, { pointerId: 1, pointerType: "mouse", isPrimary: true });
    await act(async () => {
      const cb = rafCallbacks.shift();
      cb?.(0);
    });
    expect(scrollBy.mock.calls.length).toBe(callsAfterCancel);
    scrollBy.mockRestore();
  });

  it("cleans up edge-scroll rAF when unmounted during a drag", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move", 0),
      exerciseRow("row-b", "Beta move", 1),
    ];
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const { unmount } = renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 2 })),
      }),
      widthPx,
    );
    const bar = await screen.findByTestId("pg-builder-bottom-action-bar");
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 400,
      top: 400,
      left: 0,
      bottom: 460,
      right: 300,
      width: 300,
      height: 60,
      toJSON: () => ({}),
    });
    const grip = await screen.findByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    await liftRowWithMouse(grip);
    fireEvent.pointerMove(grip, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 430,
      isPrimary: true,
    });
    unmount();
    expect(cancelFrame).toHaveBeenCalled();
    cancelFrame.mockRestore();
  });

  it("exposes the grip as a focusable control with the approved name", async () => {
    const rows = [exerciseRow("row-a", "Alpha move", 0)];
    renderBuilder(
      stubProgramsClient({
        getProgram: vi.fn().mockResolvedValue(builderView({ rows, exercise_count: 1 })),
      }),
      widthPx,
    );
    const grip = within(
      await screen.findByRole("article", { name: /Alpha move/i }),
    ).queryByRole("button", { name: GRIP_ALPHA_POSITION_1 });
    expect(grip).not.toBeNull();
    expect(grip).toHaveClass("pg-row-grip-btn");
    expect(grip?.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: GRIP_BETA_POSITION_2 })).toBeNull();
  });
});
