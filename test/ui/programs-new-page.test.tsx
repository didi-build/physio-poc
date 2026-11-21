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
  AUTO_SAVE_TRY_AGAIN_ARIA,
  NEW_PROGRAM_FROM_ROUTINE,
  NEW_PROGRAM_FROM_SCRATCH,
  NEW_PROGRAM_SHEET_TITLE,
} from "../../src/ui/copy/programs.js";
import { failedSaveItem } from "../../src/ui/copy/shared-load-states.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";

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

function builderView(): ProgramBuilderView {
  return {
    program_id: "prog-new",
    code: "PRG-NEW",
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

function stubProgramsClient(overrides: Partial<ProgramsClient> = {}): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
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
    ...overrides,
  } as unknown as ProgramsClient;
}

function scratchOptionButton(sheet: HTMLElement) {
  return within(sheet).getByRole("button", {
    name: new RegExp(NEW_PROGRAM_FROM_SCRATCH),
  });
}

function listAndBuilderStubs() {
  return {
    listPrograms: vi.fn().mockResolvedValue({
      items: [
        {
          program_id: "prog-new",
          code: "PRG-NEW",
          name: null,
          exercise_count: 0,
          draft_updated_at: "2026-10-24",
          auto_save_status: { kind: "not_published_yet" as const },
          library_updates_to_review: 0,
          deleted_at: null,
          routine_origin: null,
        },
      ],
      matched_code: "PRG-NEW",
    }),
    getProgram: vi.fn().mockResolvedValue(builderView()),
    getProgramByCode: vi.fn().mockResolvedValue(builderView()),
  };
}

describe("Programs new page (integration, jsdom)", () => {
  it("renders From a routine and From scratch chooser options (DIDI-1025)", async () => {
    render(
      <MemoryRouter initialEntries={["/programs/new"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient()}
        />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("dialog", { name: NEW_PROGRAM_SHEET_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(NEW_PROGRAM_FROM_ROUTINE)).toBeInTheDocument();
    expect(screen.getByText(NEW_PROGRAM_FROM_SCRATCH)).toBeInTheDocument();
  });

  it("keeps the sheet open and shows the empty error slot when create fails (C1, C2)", async () => {
    const createProgram = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <MemoryRouter initialEntries={["/programs/new"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({ createProgram })}
        />
      </MemoryRouter>,
    );
    const sheet = await screen.findByRole("dialog", { name: NEW_PROGRAM_SHEET_TITLE });
    await userEvent.click(scratchOptionButton(sheet));
    await waitFor(() => {
      expect(createProgram).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("dialog", { name: NEW_PROGRAM_SHEET_TITLE }),
    ).toBeInTheDocument();
    const alert = screen.getByTestId("program-create-failed-save-alert");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent(failedSaveItem("program"));
    expect(failedSaveItem("program")).toBe("Couldn't save the program. Try again.");
  });

  it("retries createProgram when Try again is pressed after create fails (C2b)", async () => {
    const createProgram = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail again"));
    render(
      <MemoryRouter initialEntries={["/programs/new"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({ createProgram })}
        />
      </MemoryRouter>,
    );
    const sheet = await screen.findByRole("dialog", { name: NEW_PROGRAM_SHEET_TITLE });
    await userEvent.click(scratchOptionButton(sheet));
    await waitFor(() => {
      expect(
        screen.getByTestId("program-create-failed-save-alert"),
      ).toBeInTheDocument();
    });
    expect(createProgram).toHaveBeenCalledTimes(1);
    await userEvent.click(
      screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN_ARIA }),
    );
    await waitFor(() => {
      expect(createProgram).toHaveBeenCalledTimes(2);
    });
    expect(scratchOptionButton(sheet)).toBeInTheDocument();
  });

  it("does not show the error slot when create succeeds (C3)", async () => {
    const createProgram = vi.fn().mockResolvedValue({ program: builderView() });
    render(
      <MemoryRouter initialEntries={["/programs/new"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            createProgram,
            ...listAndBuilderStubs(),
          })}
        />
      </MemoryRouter>,
    );
    expect(
      screen.queryByTestId("program-create-failed-save-alert"),
    ).not.toBeInTheDocument();
    const sheet = await screen.findByRole("dialog", { name: NEW_PROGRAM_SHEET_TITLE });
    await userEvent.click(scratchOptionButton(sheet));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Program name" })).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("program-create-failed-save-alert"),
    ).not.toBeInTheDocument();
  });

  it("clears the error slot at the start of each retry attempt (C4)", async () => {
    let rejectSecond: ((reason: Error) => void) | undefined;
    const createProgram = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectSecond = reject;
          }),
      );
    render(
      <MemoryRouter initialEntries={["/programs/new"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({ createProgram })}
        />
      </MemoryRouter>,
    );
    const sheet = await screen.findByRole("dialog", { name: NEW_PROGRAM_SHEET_TITLE });
    await userEvent.click(scratchOptionButton(sheet));
    await waitFor(() => {
      expect(
        screen.getByTestId("program-create-failed-save-alert"),
      ).toBeInTheDocument();
    });
    await userEvent.click(scratchOptionButton(sheet));
    await waitFor(() => {
      expect(
        screen.queryByTestId("program-create-failed-save-alert"),
      ).not.toBeInTheDocument();
    });
    rejectSecond?.(new Error("fail again"));
    await waitFor(() => {
      expect(
        screen.getByTestId("program-create-failed-save-alert"),
      ).toBeInTheDocument();
    });
    expect(createProgram).toHaveBeenCalledTimes(2);
  });
});
