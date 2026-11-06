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
  ADJUST,
  BUILDER_ROWS_HINT,
  DONE_ADJUSTING,
  DOSE_CHANGED_FOR_THIS_ROW_ONLY,
  DOSE_EDITED_BADGE,
  DUPLICATE_CONTROL_TITLE,
  LEAVE_CONFIRM,
  LEAVE_TITLE,
  PENDING_REVIEW_BADGE,
  PROGRAM_ROW_SOURCE_FROM_GLOBAL_DEFAULTS,
  PROGRAM_ROW_SOURCE_FROM_MY_DEFAULTS,
  PROGRAM_ROW_SOURCE_FROM_MY_EXERCISE,
  RESET_TO_DEFAULT,
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
import { ADD_PARAMETER, TYPE_LABELS } from "../../src/ui/copy/my-defaults.js";
import { NAV_TAB_PROGRAMS } from "../../src/ui/copy/nav.js";
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
      resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
      resolved_params_source: "global_defaults",
    };
    const stretchMove: ProgramBuilderRow = {
      ...exerciseRow("row-st", "Stretch move", 1),
      prescription_type: "stretching",
      params: {
        hold_s: 30,
        per_day: { min: 1, max: 3 },
        days_per_week: 7,
      },
      params_source: "global_defaults",
      resolved_params: {
        hold_s: 30,
        per_day: { min: 1, max: 3 },
        days_per_week: 7,
      },
      resolved_params_source: "global_defaults",
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
      params: {
        hold_s: 30,
        per_day: { min: 1, max: 3 },
        days_per_week: 7,
      },
      params_source: "global_defaults",
      resolved_params: {
        hold_s: 30,
        per_day: { min: 1, max: 3 },
        days_per_week: 7,
      },
      resolved_params_source: "global_defaults",
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

  it("M8: shows the grey dose readout box with Adjust and source note when in sync with defaults", async () => {
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
    expect(doseBox).not.toHaveClass("pg-row-dose-box--edited");
    expect(
      within(strengthCard).getByRole("button", { name: `${ADJUST} Strength move` }),
    ).toBeInTheDocument();
    expect(
      within(strengthCard).getByText(PROGRAM_ROW_SOURCE_FROM_GLOBAL_DEFAULTS),
    ).toBeInTheDocument();
  });
});

describe("Program builder dose box (DIDI-1167, integration, jsdom)", () => {
  it("saves edited params via auto-save and shows amber edited state when stored params differ from defaults", async () => {
    const baseRow = exerciseRow("row-stg", "Strength move", 0);
    const afterSave: ProgramBuilderRow = {
      ...baseRow,
      params: { reps: 12, hold_s: 2, sets: 3, days_per_week: 3 },
      params_source: null,
      resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
      resolved_params_source: "global_defaults",
    };
    const updateRow = vi.fn().mockImplementation(async () => ({
      program: builderView({
        rows: [afterSave],
        exercise_count: 1,
      }),
    }));
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [baseRow], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    await userEvent.click(within(card).getByRole("button", { name: /More reps/i }));
    await userEvent.click(within(card).getByRole("button", { name: /More reps/i }));
    await userEvent.click(within(card).getByRole("button", { name: DONE_ADJUSTING }));
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-stg", {
        params: expect.objectContaining({ reps: 12 }),
      });
    });
    expect(
      within(card).getByText(DOSE_EDITED_BADGE, { selector: ".pg-row-dose-badge" }),
    ).toBeInTheDocument();
    expect(within(card).getByText(DOSE_CHANGED_FOR_THIS_ROW_ONLY)).toBeInTheDocument();
    const doseBox = within(card)
      .getByText(/12 reps/)
      .closest(".pg-row-dose-box");
    expect(doseBox).toHaveClass("pg-row-dose-box--edited");
  });

  it("persists reps change when closing with top Done before debounce", async () => {
    const baseRow = exerciseRow("row-stg", "Strength move", 0);
    const afterSave: ProgramBuilderRow = {
      ...baseRow,
      params: { reps: 11, hold_s: 2, sets: 3, days_per_week: 3 },
      params_source: null,
      resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
      resolved_params_source: "global_defaults",
    };
    const updateRow = vi.fn().mockImplementation(async () => ({
      program: builderView({
        rows: [afterSave],
        exercise_count: 1,
      }),
    }));
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [baseRow], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    await userEvent.click(within(card).getByRole("button", { name: /More reps/i }));
    await userEvent.click(
      within(card).getByRole("button", {
        name: `${DONE_ADJUSTING} Strength move`,
      }),
    );
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-stg", {
        params: expect.objectContaining({ reps: 11 }),
      });
    });
  });

  it("debounced auto-save PATCHes row params while editor stays open", async () => {
    const baseRow = exerciseRow("row-stg", "Strength move", 0);
    const afterSave: ProgramBuilderRow = {
      ...baseRow,
      params: { reps: 11, hold_s: 2, sets: 3, days_per_week: 3 },
      params_source: null,
      resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
      resolved_params_source: "global_defaults",
    };
    const updateRow = vi.fn().mockImplementation(async () => ({
      program: builderView({
        rows: [afterSave],
        exercise_count: 1,
      }),
    }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [baseRow], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    await userEvent.click(within(card).getByRole("button", { name: /More reps/i }));
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-stg", {
        params: expect.objectContaining({ reps: 11 }),
      });
    });
    vi.useRealTimers();
  });

  it("keeps dose box grey while Adjust is open with no edits", async () => {
    const row = exerciseRow("row-stg", "Strength move", 0);
    const updateRow = vi.fn();
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [row], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    const doseText = within(card)
      .getByText(/10 reps/)
      .closest(".pg-row-dose-box");
    expect(doseText).not.toHaveClass("pg-row-dose-box--edited");
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    expect(doseText).not.toHaveClass("pg-row-dose-box--edited");
    await new Promise((r) => {
      setTimeout(r, 150);
    });
    expect(updateRow).not.toHaveBeenCalled();
  });

  it("partial stored params do not grow with defaults on no-op Adjust open and close", async () => {
    const partialStretch: ProgramBuilderRow = {
      id: "row-st",
      position: 0,
      kind: "exercise",
      exercise_id: "ex-1",
      exercise_version_id: "v1",
      exercise_request_id: null,
      pinned_version_number: 1,
      prescription_type: "stretching",
      params: { hold_s: 30, per_day: 2 },
      params_source: "global_defaults",
      resolved_params: {
        hold_s: 30,
        per_day: { min: 1, max: 3 },
        days_per_week: 7,
      },
      resolved_params_source: "global_defaults",
      text_snapshot: { title: "Stretch move" },
      note: null,
      library_update: null,
      exercise_version_choices: [{ exercise_version_id: "v1", version_number: 1 }],
    };
    const updateRow = vi.fn();
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(
            builderView({ rows: [partialStretch], exercise_count: 1 }),
          ),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Stretch move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Stretch move` }),
    );
    await userEvent.click(
      within(card).getByRole("button", { name: `${DONE_ADJUSTING} Stretch move` }),
    );
    await new Promise((r) => {
      setTimeout(r, 150);
    });
    expect(updateRow).not.toHaveBeenCalled();
  });

  it("persists latest reps when bottom Done closes after an in-flight PATCH", async () => {
    const baseRow = exerciseRow("row-stg", "Strength move", 0);
    let resolveFirst!: (value: unknown) => void;
    const firstDone = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    let callCount = 0;
    const updateRow = vi.fn().mockImplementation(async () => {
      callCount += 1;
      const nextReps = callCount === 1 ? 11 : 12;
      const saved: ProgramBuilderRow = {
        ...baseRow,
        params: { reps: nextReps, hold_s: 2, sets: 3, days_per_week: 3 },
        params_source: null,
        resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
        resolved_params_source: "global_defaults",
      };
      if (callCount === 1) {
        await firstDone;
      }
      return {
        program: builderView({
          rows: [saved],
          exercise_count: 1,
        }),
      };
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [baseRow], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    await userEvent.click(within(card).getByRole("button", { name: /More reps/i }));
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(1);
    });
    await userEvent.click(within(card).getByRole("button", { name: /More reps/i }));
    await userEvent.click(within(card).getByRole("button", { name: DONE_ADJUSTING }));
    resolveFirst!(undefined);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(2);
    });
    expect(updateRow).toHaveBeenLastCalledWith("prog-1", "row-stg", {
      params: expect.objectContaining({ reps: 12 }),
    });
    await waitFor(() => {
      const readout = card.querySelector(".pg-row-dose-text");
      expect(readout?.textContent).toMatch(/^12 reps/);
    });
    vi.useRealTimers();
  });

  it("persists reps 10 when reverted while first PATCH is in flight then bottom Done", async () => {
    const baseRow = exerciseRow("row-stg", "Strength move", 0);
    let resolveFirst!: (value: unknown) => void;
    const firstDone = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    let callCount = 0;
    /** Mock durable server row params: set only after this request's simulated latency. */
    let durableReps = 10;
    const latencyFirstMs = 80;
    const latencySecondMs = 10;
    const updateRow = vi.fn().mockImplementation(async (_pid, _rid, body) => {
      callCount += 1;
      const reps = (body as { params: { reps: number } }).params.reps;
      const saved: ProgramBuilderRow = {
        ...baseRow,
        params: { reps, hold_s: 2, sets: 3, days_per_week: 3 },
        params_source: null,
        resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
        resolved_params_source: "global_defaults",
      };
      if (callCount === 1) {
        await firstDone;
        await vi.advanceTimersByTimeAsync(latencyFirstMs);
      } else {
        await vi.advanceTimersByTimeAsync(latencySecondMs);
      }
      durableReps = reps;
      return {
        program: builderView({
          rows: [saved],
          exercise_count: 1,
        }),
      };
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [baseRow], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    await userEvent.click(within(card).getByRole("button", { name: /More reps/i }));
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(1);
    });
    await userEvent.click(within(card).getByRole("button", { name: /Less reps/i }));
    await userEvent.click(within(card).getByRole("button", { name: DONE_ADJUSTING }));
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(1);
    });
    resolveFirst!(undefined);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(2);
    });
    await vi.runAllTimersAsync();
    expect(updateRow).toHaveBeenLastCalledWith("prog-1", "row-stg", {
      params: expect.objectContaining({ reps: 10 }),
    });
    await waitFor(() => {
      const readout = card.querySelector(".pg-row-dose-text");
      expect(readout?.textContent).toMatch(/^10 reps/);
    });
    expect(durableReps).toBe(10);
    vi.useRealTimers();
  });

  it("persists reps 10 when reverted while first PATCH is in flight then Leave", async () => {
    const baseRow = exerciseRow("row-stg", "Strength move", 0);
    let resolveFirst!: (value: unknown) => void;
    const firstDone = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    let callCount = 0;
    /** Mock durable server row params: set only after this request's simulated latency. */
    let durableReps = 10;
    const latencyFirstMs = 80;
    const latencySecondMs = 10;
    const updateRow = vi.fn().mockImplementation(async (_pid, _rid, body) => {
      callCount += 1;
      const reps = (body as { params: { reps: number } }).params.reps;
      const saved: ProgramBuilderRow = {
        ...baseRow,
        params: { reps, hold_s: 2, sets: 3, days_per_week: 3 },
        params_source: null,
        resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
        resolved_params_source: "global_defaults",
      };
      if (callCount === 1) {
        await firstDone;
        await vi.advanceTimersByTimeAsync(latencyFirstMs);
      } else {
        await vi.advanceTimersByTimeAsync(latencySecondMs);
      }
      durableReps = reps;
      return {
        program: builderView({
          rows: [saved],
          exercise_count: 1,
        }),
      };
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [baseRow], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    await userEvent.click(within(card).getByRole("button", { name: /More reps/i }));
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(1);
    });
    await userEvent.click(within(card).getByRole("button", { name: /Less reps/i }));
    const programsTabs = screen.getAllByRole("link", { name: NAV_TAB_PROGRAMS });
    await userEvent.click(programsTabs[0]!);
    expect(
      await screen.findByRole("dialog", { name: LEAVE_TITLE }),
    ).toBeInTheDocument();
    await waitFor(() => {
      const readout = card.querySelector(".pg-row-dose-text");
      expect(readout?.textContent).toMatch(/^10 reps/);
    });
    await userEvent.click(screen.getByRole("button", { name: LEAVE_CONFIRM }));
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(1);
    });
    resolveFirst!(undefined);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(2);
    });
    await vi.runAllTimersAsync();
    expect(updateRow).toHaveBeenLastCalledWith("prog-1", "row-stg", {
      params: expect.objectContaining({ reps: 10 }),
    });
    expect(durableReps).toBe(10);
    vi.useRealTimers();
  });

  it("shows days per week as counted days and Every day for 7 in the stepper", async () => {
    const baseRow = exerciseRow("row-stg", "Strength move", 0);
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [baseRow], exercise_count: 1 })),
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    expect(
      within(card).getByText("3 days", {
        selector: ".pg-row-dose-stepper-value",
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(card).getByRole("button", { name: /More days per week/i }),
    );
    await userEvent.click(
      within(card).getByRole("button", { name: /More days per week/i }),
    );
    await userEvent.click(
      within(card).getByRole("button", { name: /More days per week/i }),
    );
    await userEvent.click(
      within(card).getByRole("button", { name: /More days per week/i }),
    );
    expect(
      within(card).getByText("Every day", {
        selector: ".pg-row-dose-stepper-value",
      }),
    ).toBeInTheDocument();
  });

  it("steps stretching times per day through a range option", async () => {
    const stretchRow: ProgramBuilderRow = {
      id: "row-st",
      position: 0,
      kind: "exercise",
      exercise_id: "ex-1",
      exercise_version_id: "v1",
      exercise_request_id: null,
      pinned_version_number: 1,
      prescription_type: "stretching",
      params: { hold_s: 30, per_day: 3, days_per_week: 3 },
      params_source: "global_defaults",
      resolved_params: {
        hold_s: 30,
        per_day: { min: 1, max: 3 },
        days_per_week: 7,
      },
      resolved_params_source: "global_defaults",
      text_snapshot: { title: "Stretch move" },
      note: null,
      library_update: null,
      exercise_version_choices: [{ exercise_version_id: "v1", version_number: 1 }],
    };
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [stretchRow], exercise_count: 1 })),
      }),
    );
    const card = await screen.findByRole("article", { name: /Stretch move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Stretch move` }),
    );
    expect(
      within(card).getByText("3", {
        selector: ".pg-row-dose-stepper-value",
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(card).getByRole("button", { name: /More times per day/i }),
    );
    expect(
      within(card).getByText("1 to 2", {
        selector: ".pg-row-dose-stepper-value",
      }),
    ).toBeInTheDocument();
  });

  it("adds Up (ascent) and Rest, then removes Rest via stepper controls", async () => {
    const baseRow = exerciseRow("row-stg", "Strength move", 0);
    const afterAddUp: ProgramBuilderRow = {
      ...baseRow,
      params: {
        reps: 10,
        hold_s: 2,
        sets: 3,
        days_per_week: 3,
        ascent_s: 2,
      },
    };
    const afterAddRest: ProgramBuilderRow = {
      ...afterAddUp,
      params: { ...afterAddUp.params, rest_s: 60 },
    };
    const afterRemoveRest: ProgramBuilderRow = {
      ...afterAddRest,
      params: {
        reps: 10,
        hold_s: 2,
        sets: 3,
        days_per_week: 3,
        ascent_s: 2,
      },
    };
    const updateRow = vi
      .fn()
      .mockResolvedValueOnce({
        program: builderView({ rows: [afterAddUp], exercise_count: 1 }),
      })
      .mockResolvedValueOnce({
        program: builderView({ rows: [afterAddRest], exercise_count: 1 }),
      })
      .mockResolvedValue({
        program: builderView({ rows: [afterRemoveRest], exercise_count: 1 }),
      });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [baseRow], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    await userEvent.click(within(card).getByRole("button", { name: ADD_PARAMETER }));
    await userEvent.click(within(card).getByRole("button", { name: /^Up \(s\)$/ }));
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-stg", {
        params: expect.objectContaining({ ascent_s: 2 }),
      });
    });
    await userEvent.click(within(card).getByRole("button", { name: ADD_PARAMETER }));
    await userEvent.click(
      within(card).getByRole("button", { name: /^Rest between sets \(s\)$/ }),
    );
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-stg", {
        params: expect.objectContaining({ rest_s: 60 }),
      });
    });
    await userEvent.click(
      within(card).getByRole("button", { name: /Remove rest between sets/i }),
    );
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      const lastCall = updateRow.mock.calls[updateRow.mock.calls.length - 1];
      expect(lastCall?.[2].params).not.toHaveProperty("rest_s");
    });
    vi.useRealTimers();
  });

  it("adds and removes Down on isometric row, adds Up then removes Up", async () => {
    const isoBase: ProgramBuilderRow = {
      ...exerciseRow("row-iso", "Iso move", 0),
      prescription_type: "isometric",
      text_snapshot: { title: "Iso move" },
    };
    const withDown: ProgramBuilderRow = {
      ...isoBase,
      params: {
        reps: 10,
        hold_s: 2,
        sets: 3,
        days_per_week: 3,
        descent_s: 3,
      },
    };
    const withUp: ProgramBuilderRow = {
      ...withDown,
      params: { ...withDown.params, ascent_s: 2 },
    };
    const afterRemoveDown: ProgramBuilderRow = {
      ...isoBase,
      params: {
        reps: 10,
        hold_s: 2,
        sets: 3,
        days_per_week: 3,
        ascent_s: 2,
      },
    };
    const afterRemoveUp: ProgramBuilderRow = {
      ...isoBase,
      params: {
        reps: 10,
        hold_s: 2,
        sets: 3,
        days_per_week: 3,
      },
    };
    const updateRow = vi
      .fn()
      .mockResolvedValueOnce({
        program: builderView({ rows: [withDown], exercise_count: 1 }),
      })
      .mockResolvedValueOnce({
        program: builderView({ rows: [withUp], exercise_count: 1 }),
      })
      .mockResolvedValueOnce({
        program: builderView({ rows: [afterRemoveDown], exercise_count: 1 }),
      })
      .mockResolvedValue({
        program: builderView({ rows: [afterRemoveUp], exercise_count: 1 }),
      });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [isoBase], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Iso move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Iso move` }),
    );
    await userEvent.click(within(card).getByRole("button", { name: ADD_PARAMETER }));
    await userEvent.click(within(card).getByRole("button", { name: /^Down \(s\)$/ }));
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-iso", {
        params: expect.objectContaining({ descent_s: 3 }),
      });
    });
    await userEvent.click(within(card).getByRole("button", { name: ADD_PARAMETER }));
    await userEvent.click(within(card).getByRole("button", { name: /^Up \(s\)$/ }));
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-iso", {
        params: expect.objectContaining({ ascent_s: 2 }),
      });
    });
    await userEvent.click(within(card).getByRole("button", { name: /Remove down/i }));
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      const last = updateRow.mock.calls[updateRow.mock.calls.length - 1];
      expect(last?.[2].params).not.toHaveProperty("descent_s");
    });
    await userEvent.click(within(card).getByRole("button", { name: /Remove up/i }));
    await vi.advanceTimersByTimeAsync(120);
    await waitFor(() => {
      const last = updateRow.mock.calls[updateRow.mock.calls.length - 1];
      expect(last?.[2].params).not.toHaveProperty("ascent_s");
    });
    vi.useRealTimers();
  });

  it("does not open leave sheet on navigation when Adjust is open with no edits on a legacy strength row", async () => {
    const legacy: ProgramBuilderRow = {
      ...exerciseRow("row-leg", "Legacy move", 0),
      params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3, per_day: 2 },
    };
    const updateRow = vi.fn();
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [legacy], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Legacy move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Legacy move` }),
    );
    const programsTabs = screen.getAllByRole("link", { name: NAV_TAB_PROGRAMS });
    await userEvent.click(programsTabs[0]!);
    expect(screen.queryByRole("dialog", { name: LEAVE_TITLE })).not.toBeInTheDocument();
    expect(updateRow).not.toHaveBeenCalled();
  });

  it("opens leave sheet when a dose edit is pending and navigation is requested", async () => {
    const baseRow = exerciseRow("row-stg", "Strength move", 0);
    const savedRow: ProgramBuilderRow = {
      ...baseRow,
      params: { reps: 11, hold_s: 2, sets: 3, days_per_week: 3 },
      params_source: null,
      resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
      resolved_params_source: "global_defaults",
    };
    const updateRow = vi.fn().mockResolvedValue({
      program: builderView({ rows: [savedRow], exercise_count: 1 }),
    });
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [baseRow], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(
      within(card).getByRole("button", { name: `${ADJUST} Strength move` }),
    );
    await userEvent.click(within(card).getByRole("button", { name: /More reps/i }));
    const programsTabs = screen.getAllByRole("link", { name: NAV_TAB_PROGRAMS });
    await userEvent.click(programsTabs[0]!);
    expect(
      await screen.findByRole("dialog", { name: LEAVE_TITLE }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: LEAVE_CONFIRM }));
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-stg", {
        params: expect.objectContaining({ reps: 11 }),
      });
    });
    expect(screen.queryByRole("dialog", { name: LEAVE_TITLE })).not.toBeInTheDocument();
  });

  it("Reset to default PATCHes resolved params and clears edited chrome", async () => {
    const edited: ProgramBuilderRow = {
      ...exerciseRow("row-stg", "Strength move", 0),
      params: { reps: 12, hold_s: 2, sets: 3, days_per_week: 3 },
      params_source: null,
      resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
      resolved_params_source: "global_defaults",
    };
    const resetPayload = { ...edited.resolved_params };
    const updateRow = vi.fn().mockImplementation(async () => ({
      program: builderView({
        rows: [
          {
            ...edited,
            params: resetPayload,
            params_source: "global_defaults",
          },
        ],
        exercise_count: 1,
      }),
    }));
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [edited], exercise_count: 1 })),
        updateRow,
      }),
    );
    const card = await screen.findByRole("article", { name: /Strength move/i });
    await userEvent.click(within(card).getByRole("button", { name: RESET_TO_DEFAULT }));
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-stg", {
        params: resetPayload,
      });
    });
    expect(within(card).queryByText(DOSE_EDITED_BADGE)).not.toBeInTheDocument();
    expect(
      within(card).getByText(PROGRAM_ROW_SOURCE_FROM_GLOBAL_DEFAULTS),
    ).toBeInTheDocument();
  });

  it("shows From my exercise when params_source is exercise_override", async () => {
    const row: ProgramBuilderRow = {
      ...exerciseRow("row-ex", "My exercise row", 0),
      params_source: "exercise_override",
      resolved_params_source: "exercise_override",
    };
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [row], exercise_count: 1 })),
      }),
    );
    const card = await screen.findByRole("article", { name: /My exercise row/i });
    expect(
      within(card).getByText(PROGRAM_ROW_SOURCE_FROM_MY_EXERCISE),
    ).toBeInTheDocument();
  });

  it("shows From my defaults when params_source is practitioner_defaults", async () => {
    const row: ProgramBuilderRow = {
      ...exerciseRow("row-md", "Defaults row", 0),
      params_source: "practitioner_defaults",
      resolved_params_source: "practitioner_defaults",
    };
    renderBuilder(
      stubProgramsClient({
        getProgram: vi
          .fn()
          .mockResolvedValue(builderView({ rows: [row], exercise_count: 1 })),
      }),
    );
    const card = await screen.findByRole("article", { name: /Defaults row/i });
    expect(
      within(card).getByText(PROGRAM_ROW_SOURCE_FROM_MY_DEFAULTS),
    ).toBeInTheDocument();
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
      resolved_params: { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 },
      resolved_params_source: "global_defaults",
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
