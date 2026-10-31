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
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_SAVING,
  CLEAR_SEARCH,
  DELETE_PROGRAM,
  DELETE_PROGRAM_SHEET_TITLE,
  DELETE_SHEET_ALREADY_CLOSED,
  DELETE_SHEET_MOVES_TO,
  DELETE_SHEET_SHARE_HINT,
  ROW_NOTES_LABEL,
  ADD_EXERCISE,
  duplicateRowAriaLabel,
  removeRowAriaLabel,
  LIBRARY_UPDATE_KEEP,
  libraryUpdateApplyLabel,
  LEAVE_TITLE,
  listCountLabel,
  programsSearchNoMatch,
} from "../../src/ui/copy/programs.js";
import { NAV_TAB_EXERCISES } from "../../src/ui/copy/nav.js";
import type {
  ProgramBuilderRow,
  ProgramBuilderView,
  ProgramListItem,
} from "../../src/services/programs/types.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  vi.useRealTimers();
});

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

function makeListItem(
  overrides: Partial<ProgramListItem> & { program_id: string; code: string },
): ProgramListItem {
  return {
    name: "Knee program A",
    exercise_count: 0,
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    library_updates_to_review: 0,
    deleted_at: null,
    routine_origin: null,
    ...overrides,
  };
}

function serverListPrograms(allItems: ProgramListItem[]) {
  return vi.fn((q?: string) => {
    const trimmed = q?.trim() ?? "";
    if (trimmed.length === 0) {
      return Promise.resolve({ items: allItems, matched_code: null });
    }
    const needle = trimmed.toLowerCase();
    const items = allItems.filter((item) => {
      const name = (item.name ?? "").toLowerCase();
      const code = item.code.toLowerCase();
      const routine = item.routine_origin?.routine_name.toLowerCase() ?? "";
      return name.includes(needle) || code.includes(needle) || routine.includes(needle);
    });
    let matched_code: string | null = null;
    for (const item of items) {
      if (item.code.toUpperCase().includes(trimmed.toUpperCase())) {
        matched_code = item.code;
        break;
      }
    }
    return Promise.resolve({ items, matched_code });
  });
}

const ALL_LIST_ITEMS = [
  makeListItem({ program_id: "p1", code: "PRG-ONE", name: "Alpha program" }),
  makeListItem({ program_id: "p2", code: "PRG-TWO", name: "Beta program" }),
  makeListItem({
    program_id: "p3",
    code: "PRG-THREE",
    name: "Gamma program",
    routine_origin: {
      routine_id: "r1",
      routine_version_id: "rv1",
      routine_version_number: 1,
      routine_name: "Knee rehab routine",
      used_as: "used_as_is",
    },
  }),
];

function builderView(overrides: Partial<ProgramBuilderView> = {}): ProgramBuilderView {
  return {
    program_id: "prog-1",
    code: "PRG-TEST",
    name: null,
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: 1,
    library_updates_to_review: 0,
    rows: [],
    open_share_link: false,
    deleted_at: null,
    routine_origin: null,
    ...overrides,
  };
}

function exerciseRow(id: string, title: string): ProgramBuilderRow {
  return {
    id,
    position: 1,
    kind: "exercise",
    exercise_id: "ex-1",
    exercise_version_id: "v1",
    exercise_request_id: null,
    pinned_version_number: 1,
    prescription_type: "concentric",
    params: { reps: 10 },
    params_source: "global_defaults",
    text_snapshot: { title },
    note: null,
    library_update: null,
  };
}

function builderStubs(overrides: Partial<ProgramsClient> = {}): ProgramsClient {
  const listItem = makeListItem({
    program_id: "prog-1",
    code: "PRG-TEST",
    name: "Knee program A",
  });
  return {
    listPrograms: vi.fn().mockResolvedValue({
      items: [listItem],
      matched_code: "PRG-TEST",
    }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    createProgram: vi.fn(),
    getProgram: vi.fn().mockResolvedValue(builderView()),
    updateProgramName: vi.fn().mockImplementation(async (_id, name) => ({
      program: builderView({ name }),
    })),
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

describe("Programs list search (QA round 1)", () => {
  it("shows no match when the server returns zero items for a query", async () => {
    render(
      <MemoryRouter initialEntries={["/programs?q=nomatch"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            listPrograms: serverListPrograms(ALL_LIST_ITEMS),
          })}
        />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(programsSearchNoMatch("nomatch")),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CLEAR_SEARCH })).toBeInTheDocument();
  });

  it("shows 1 of 3 programs for a code search with server-filtered results", async () => {
    render(
      <MemoryRouter initialEntries={["/programs?q=PRG-ONE"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            listPrograms: serverListPrograms(ALL_LIST_ITEMS),
          })}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText(listCountLabel(3, 1)!)).toBeInTheDocument();
  });

  it("shows routine-name matches from the server without client filtering", async () => {
    render(
      <MemoryRouter initialEntries={["/programs?q=Knee%20rehab"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            listPrograms: serverListPrograms(ALL_LIST_ITEMS),
          })}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Gamma program")).toBeInTheDocument();
    expect(screen.getByText(listCountLabel(3, 1)!)).toBeInTheDocument();
  });
});

describe("Programs builder save UX (QA round 1)", () => {
  it("keeps the name draft when the user types during a deferred save", async () => {
    let resolveSave: ((value: { program: ProgramBuilderView }) => void) | undefined;
    const updateProgramName = vi.fn().mockImplementation(
      () =>
        new Promise<{ program: ProgramBuilderView }>((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({ updateProgramName })}
        />
      </MemoryRouter>,
    );
    const nameField = await screen.findByRole("textbox", { name: "Program name" });
    await userEvent.type(nameField, "Kn");
    await waitFor(() => {
      expect(updateProgramName).toHaveBeenCalled();
    });
    await userEvent.type(nameField, "ee");
    resolveSave?.({ program: builderView({ name: "Kn" }) });
    await waitFor(() => {
      expect(nameField).toHaveValue("Knee");
    });
  });

  it("keeps row note text enabled while updateRow is pending", async () => {
    let resolveRow: ((value: { program: ProgramBuilderView }) => void) | undefined;
    const updateRow = vi.fn().mockImplementation(
      () =>
        new Promise<{ program: ProgramBuilderView }>((resolve) => {
          resolveRow = resolve;
        }),
    );
    const row = exerciseRow("row-1", "Heel raise");
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(builderView({ rows: [row] })),
            updateRow,
          })}
        />
      </MemoryRouter>,
    );
    const note = await screen.findByLabelText(ROW_NOTES_LABEL);
    await userEvent.type(note, "slow");
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalled();
    });
    expect(note).toHaveValue("slow");
    expect(note).not.toBeDisabled();
    resolveRow?.({
      program: builderView({ rows: [{ ...row, note: "slow" }] }),
    });
  });

  it("shows exactly one alert after a failed name save", async () => {
    const updateProgramName = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({ updateProgramName })}
        />
      </MemoryRouter>,
    );
    const nameField = await screen.findByRole("textbox", { name: "Program name" });
    await userEvent.type(nameField, "Knee program A");
    await waitFor(() => {
      expect(updateProgramName).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    });
    expect(screen.getAllByText(AUTO_SAVE_NOT_SAVED).length).toBeGreaterThan(0);
  });

  it("shows Not saved when updateRow fails", async () => {
    const updateRow = vi.fn().mockRejectedValue(new Error("fail"));
    const row = exerciseRow("row-1", "Heel raise");
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(builderView({ rows: [row] })),
            updateRow,
          })}
        />
      </MemoryRouter>,
    );
    const note = await screen.findByLabelText(ROW_NOTES_LABEL);
    await userEvent.type(note, "x");
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText(AUTO_SAVE_NOT_SAVED).length).toBeGreaterThan(0);
    });
  });

  it("renders delete sheet body for open and closed share links", async () => {
    const openLinkProgram = builderView({
      name: "Knee program A",
      open_share_link: true,
    });
    const closedLinkProgram = builderView({
      name: "Knee program A",
      open_share_link: false,
    });
    for (const program of [openLinkProgram, closedLinkProgram]) {
      cleanup();
      render(
        <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
          <PhysioApp
            exerciseLibraryClient={stubLibraryClient()}
            programsClient={builderStubs({
              getProgram: vi.fn().mockResolvedValue(program),
            })}
          />
        </MemoryRouter>,
      );
      await userEvent.click(
        await screen.findByRole("button", { name: DELETE_PROGRAM }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: DELETE_PROGRAM_SHEET_TITLE,
      });
      expect(
        within(dialog).getAllByText(
          (_, element) =>
            element?.textContent?.includes(DELETE_SHEET_MOVES_TO) ?? false,
        )[0],
      ).toBeInTheDocument();
      expect(within(dialog).getByText(DELETE_SHEET_SHARE_HINT)).toBeInTheDocument();
      if (!program.open_share_link) {
        expect(
          within(dialog).getByText(DELETE_SHEET_ALREADY_CLOSED, { exact: false }),
        ).toBeInTheDocument();
      }
    }
  });

  it("shows Saving... while a row type change is in flight", async () => {
    const updateRow = vi
      .fn()
      .mockImplementation(() => new Promise<{ program: ProgramBuilderView }>(() => {}));
    const row = exerciseRow("row-1", "Heel raise");
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(builderView({ rows: [row] })),
            updateRow,
          })}
        />
      </MemoryRouter>,
    );
    const typeSelect = await screen.findByRole("combobox");
    await userEvent.selectOptions(typeSelect, "stretching");
    await waitFor(() => {
      expect(screen.getAllByText(AUTO_SAVE_SAVING).length).toBeGreaterThan(0);
    });
  });

  it("leaves the list unchanged when restore fails", async () => {
    const restoreProgram = vi.fn().mockRejectedValue(new Error("fail"));
    const deleted = makeListItem({
      program_id: "p-del",
      code: "PRG-DEL",
      deleted_at: "2026-10-24T12:00:00.000Z",
    });
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
            listDeletedPrograms: vi.fn().mockResolvedValue({ items: [deleted] }),
            restoreProgram,
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => {
      expect(restoreProgram).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("shows Not saved when addExerciseRow fails", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-row-id" });
    const addExerciseRow = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            addExerciseRow,
            getProgram: vi.fn().mockResolvedValue(builderView()),
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: ADD_EXERCISE }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Add Heel raise" }),
    );
    await waitFor(() => {
      expect(addExerciseRow).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText(AUTO_SAVE_NOT_SAVED).length).toBeGreaterThan(0);
    });
  });

  it("shows Not saved when reorderRows fails", async () => {
    const rows = [
      exerciseRow("row-a", "Alpha move"),
      { ...exerciseRow("row-b", "Beta move"), position: 2 },
    ];
    const reorderRows = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ rows, exercise_count: 2 })),
            reorderRows,
          })}
        />
      </MemoryRouter>,
    );
    const alphaCard = await screen.findByRole("article", { name: /Alpha move/i });
    await userEvent.click(
      within(alphaCard).getByRole("button", {
        name: /Reorder Alpha move, position 2/,
      }),
    );
    await waitFor(() => {
      expect(reorderRows).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText(AUTO_SAVE_NOT_SAVED).length).toBeGreaterThan(0);
    });
  });

  it("shows Not saved when duplicateRow fails", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "dup-row-id" });
    const duplicateRow = vi.fn().mockRejectedValue(new Error("fail"));
    const rows = [exerciseRow("row-a", "Alpha move")];
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ rows, exercise_count: 1 })),
            duplicateRow,
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: duplicateRowAriaLabel("Alpha move"),
      }),
    );
    await waitFor(() => {
      expect(duplicateRow).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText(AUTO_SAVE_NOT_SAVED).length).toBeGreaterThan(0);
    });
  });

  it("shows Not saved when deleteRow fails", async () => {
    const deleteRow = vi.fn().mockRejectedValue(new Error("fail"));
    const rows = [exerciseRow("row-a", "Alpha move")];
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ rows, exercise_count: 1 })),
            deleteRow,
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: removeRowAriaLabel("Alpha move"),
      }),
    );
    await waitFor(() => {
      expect(deleteRow).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText(AUTO_SAVE_NOT_SAVED).length).toBeGreaterThan(0);
    });
    expect(
      screen.getByRole("heading", { name: "Alpha move", level: 3 }),
    ).toBeInTheDocument();
  });

  it("shows Not saved when applyLibraryUpdate fails", async () => {
    const applyLibraryUpdate = vi.fn().mockRejectedValue(new Error("fail"));
    const row = {
      ...exerciseRow("row-1", "Heel raise"),
      library_update: {
        row_id: "row-1",
        exercise_id: "ex-1",
        exercise_title: "Heel raise",
        pinned_version_number: 1,
        latest_version_number: 2,
      },
    };
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(builderView({ rows: [row] })),
            applyLibraryUpdate,
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: libraryUpdateApplyLabel(2),
      }),
    );
    await waitFor(() => {
      expect(applyLibraryUpdate).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText(AUTO_SAVE_NOT_SAVED).length).toBeGreaterThan(0);
    });
  });

  it("shows Not saved when keepLibraryUpdate fails", async () => {
    const keepLibraryUpdate = vi.fn().mockRejectedValue(new Error("fail"));
    const row = {
      ...exerciseRow("row-1", "Heel raise"),
      library_update: {
        row_id: "row-1",
        exercise_id: "ex-1",
        exercise_title: "Heel raise",
        pinned_version_number: 1,
        latest_version_number: 2,
      },
    };
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(builderView({ rows: [row] })),
            keepLibraryUpdate,
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: LIBRARY_UPDATE_KEEP }),
    );
    await waitFor(() => {
      expect(keepLibraryUpdate).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText(AUTO_SAVE_NOT_SAVED).length).toBeGreaterThan(0);
    });
  });

  it("closes delete sheet without navigating when deleteProgram fails", async () => {
    const deleteProgram = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ name: "Knee program A" })),
            deleteProgram,
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: DELETE_PROGRAM }));
    const dialog = await screen.findByRole("dialog", {
      name: DELETE_PROGRAM_SHEET_TITLE,
    });
    await userEvent.click(within(dialog).getByRole("button", { name: DELETE_PROGRAM }));
    await waitFor(() => {
      expect(deleteProgram).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      await screen.findByRole("textbox", { name: "Program name" }),
    ).toBeInTheDocument();
  });

  it("warns before shell nav when the builder has unsaved edits", async () => {
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            updateProgramName: vi.fn().mockImplementation(() => new Promise(() => {})),
          })}
        />
      </MemoryRouter>,
    );
    const nameField = await screen.findByRole("textbox", { name: "Program name" });
    await userEvent.type(nameField, "Draft");
    await waitFor(() => {
      expect(screen.getAllByText(AUTO_SAVE_SAVING).length).toBeGreaterThan(0);
    });
    await userEvent.click(screen.getAllByRole("link", { name: NAV_TAB_EXERCISES })[0]!);
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(LEAVE_TITLE);
  });
});
