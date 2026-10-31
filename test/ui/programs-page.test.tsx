/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  AUTO_SAVE_SAVED,
  AUTO_SAVE_SAVING,
  AUTO_SAVE_TRY_AGAIN_ARIA,
  CARD_NO_EXERCISES_YET,
  CLEAR_SEARCH,
  DELETE_PROGRAM_SHEET_TITLE,
  LEAVE_KEEP_EDITING,
  LEAVE_TITLE,
  PROGRAMS_EMPTY_HEADING,
  PROGRAMS_PAGE_TITLE,
  PUBLISH,
  RECENTLY_DELETED_EMPTY,
  RESTORE,
  AUTO_SAVE_NOT_SAVED,
  deletedProgramToast,
  libraryUpdatesToReviewFlag,
  listCountLabel,
  restoredProgramToast,
} from "../../src/ui/copy/programs.js";
import type {
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
            exercise_id: "ex-1",
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

function builderView(overrides: Partial<ProgramBuilderView> = {}): ProgramBuilderView {
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
    deleted_at: null,
    routine_origin: null,
    ...overrides,
  };
}

function stubProgramsClient(overrides: Partial<ProgramsClient> = {}): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [LIST_ITEM], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    createProgram: vi.fn().mockResolvedValue({ program: builderView() }),
    getProgram: vi.fn().mockResolvedValue(builderView()),
    updateProgramName: vi.fn().mockImplementation(async (_id, name) => ({
      program: builderView({ name }),
    })),
    deleteProgram: vi.fn().mockResolvedValue({
      program: builderView({
        name: "Knee program A",
        deleted_at: "2026-10-24T12:00:00.000Z",
      }),
    }),
    restoreProgram: vi.fn().mockResolvedValue({
      program: builderView({ name: "Knee program A" }),
    }),
    addExerciseRow: vi.fn().mockImplementation(async () => ({
      program: builderView({
        exercise_count: 1,
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
            params: { reps: 10, per_day: 2 },
            params_source: "global_defaults",
            text_snapshot: { title: "Heel raise" },
            note: null,
            library_update: null,
          },
        ],
      }),
    })),
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

describe("Programs UI (integration, jsdom)", () => {
  it("renders empty list copy and Recently deleted empty line", async () => {
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
          })}
        />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: PROGRAMS_PAGE_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(PROGRAMS_EMPTY_HEADING)).toBeInTheDocument();
    expect(screen.getByText(RECENTLY_DELETED_EMPTY)).toBeInTheDocument();
    expect(listCountLabel(0)).toBeNull();
  });

  it("highlights matched_code on search by code", async () => {
    render(
      <MemoryRouter initialEntries={["/programs?q=PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [LIST_ITEM],
              matched_code: "PRG-TEST",
            }),
          })}
        />
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: "Knee program A" });
    expect(screen.getByText("PRG-TEST")).toBeInTheDocument();
    expect(document.querySelector("mark")?.textContent).toBe("PRG-TEST");
  });

  it("shows list count for a single program", async () => {
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi
              .fn()
              .mockResolvedValue({ items: [LIST_ITEM], matched_code: null }),
          })}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText(listCountLabel(1)!)).toBeInTheDocument();
  });

  it("shows filtered list count for one match among many", async () => {
    const items = [
      LIST_ITEM,
      { ...LIST_ITEM, program_id: "prog-2", code: "PRG-TWO", name: "Other program" },
      { ...LIST_ITEM, program_id: "prog-3", code: "PRG-THREE", name: "Third program" },
    ];
    const listPrograms = vi.fn((q?: string) => {
      if (!q?.trim()) {
        return Promise.resolve({ items, matched_code: null });
      }
      if (q.toLowerCase().includes("knee")) {
        return Promise.resolve({ items: [LIST_ITEM], matched_code: null });
      }
      return Promise.resolve({ items: [], matched_code: null });
    });
    render(
      <MemoryRouter initialEntries={["/programs?q=knee"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({ listPrograms })}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText(listCountLabel(3, 1)!)).toBeInTheDocument();
  });

  it("leaves builder without a leave dialog when there are no unsaved edits", async () => {
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [LIST_ITEM],
              matched_code: "PRG-TEST",
            }),
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ name: "Knee program A" })),
          })}
        />
      </MemoryRouter>,
    );
    await screen.findByRole("textbox", { name: "Program name" });
    await userEvent.click(screen.getByRole("button", { name: PROGRAMS_PAGE_TITLE }));
    expect(
      await screen.findByRole("heading", { name: PROGRAMS_PAGE_TITLE, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: LEAVE_TITLE })).not.toBeInTheDocument();
  });

  it("shows list count for multiple programs", async () => {
    const items = [
      LIST_ITEM,
      { ...LIST_ITEM, program_id: "prog-2", code: "PRG-TWO", name: "Knee program B" },
    ];
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({ items, matched_code: null }),
          })}
        />
      </MemoryRouter>,
    );
    await screen.findByText(listCountLabel(2)!);
  });

  it("redirects to list when code lookup is not exact", async () => {
    const getProgramNearMiss = vi.fn().mockResolvedValue(builderView());
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [{ ...LIST_ITEM, code: "PRG-TESTX" }],
              matched_code: "PRG-TEST",
            }),
            getProgram: getProgramNearMiss,
          })}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: PROGRAMS_PAGE_TITLE, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(getProgramNearMiss).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "Program name" }),
    ).not.toBeInTheDocument();
  });

  it("loads builder when code lookup matches exactly", async () => {
    const getProgram = vi.fn().mockResolvedValue(builderView());
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [LIST_ITEM],
              matched_code: "PRG-TEST",
            }),
            getProgram,
          })}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(getProgram).toHaveBeenCalledWith("prog-1");
    });
    expect(
      await screen.findByRole("textbox", { name: "Program name" }),
    ).toBeInTheDocument();
  });

  it("auto-saves program name and disables Publish while saving", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    expect(vi.isFakeTimers()).toBe(true);
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
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [LIST_ITEM],
              matched_code: "PRG-TEST",
            }),
            getProgram: vi.fn().mockResolvedValue(builderView()),
            updateProgramName,
          })}
        />
      </MemoryRouter>,
    );
    const nameField = await screen.findByRole("textbox", { name: "Program name" });
    const publish = screen.getAllByRole("button", { name: PUBLISH })[0]!;
    await userEvent.type(nameField, "Knee program A");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(updateProgramName).toHaveBeenCalled();
    expect(screen.getAllByText(AUTO_SAVE_SAVING).length).toBeGreaterThan(0);
    expect(publish).toBeDisabled();
    resolveSave?.({ program: builderView({ name: "Knee program A" }) });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByText(AUTO_SAVE_SAVED).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: PUBLISH })[0]).toBeDisabled();
    vi.useRealTimers();
  });

  it("shows save failure, Try again, and keeps Publish disabled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const updateProgramName = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue({ program: builderView({ name: "Knee program A" }) });
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [LIST_ITEM],
              matched_code: "PRG-TEST",
            }),
            getProgram: vi.fn().mockResolvedValue(builderView()),
            updateProgramName,
          })}
        />
      </MemoryRouter>,
    );
    const nameField = await screen.findByRole("textbox", { name: "Program name" });
    await userEvent.type(nameField, "Knee program A");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => {
      expect(updateProgramName).toHaveBeenCalled();
    });
    expect(screen.getAllByText(AUTO_SAVE_NOT_SAVED).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: PUBLISH })[0]).toBeDisabled();
    await userEvent.click(
      screen.getAllByRole("button", { name: AUTO_SAVE_TRY_AGAIN_ARIA })[0]!,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => {
      expect(updateProgramName).toHaveBeenCalledTimes(2);
    });
    vi.useRealTimers();
  });

  it("warns before leaving with unsaved edits", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [LIST_ITEM],
              matched_code: "PRG-TEST",
            }),
            getProgram: vi.fn().mockResolvedValue(builderView()),
            updateProgramName: vi.fn().mockImplementation(() => new Promise(() => {})),
          })}
        />
      </MemoryRouter>,
    );
    const nameField = await screen.findByRole("textbox", { name: "Program name" });
    await userEvent.type(nameField, "Draft name");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(screen.getAllByText(AUTO_SAVE_SAVING).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: PROGRAMS_PAGE_TITLE }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(LEAVE_TITLE);
    expect(screen.getByText(LEAVE_KEEP_EDITING)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("deletes with confirm toast and restores without link action", async () => {
    const deleteProgram = vi.fn().mockResolvedValue({
      program: builderView({ name: "Knee program A" }),
    });
    const restoreProgram = vi.fn().mockResolvedValue({
      program: builderView({ name: "Knee program A" }),
    });
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
            listDeletedPrograms: vi.fn().mockResolvedValue({
              items: [{ ...LIST_ITEM, deleted_at: "2026-10-24" }],
            }),
            deleteProgram,
            restoreProgram,
          })}
        />
      </MemoryRouter>,
    );
    cleanup();
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [LIST_ITEM],
              matched_code: "PRG-TEST",
            }),
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ name: "Knee program A" })),
            deleteProgram,
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete program" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(DELETE_PROGRAM_SHEET_TITLE);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete program" }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(deletedProgramToast("Knee program A")),
      ).toBeInTheDocument();
    });

    cleanup();
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
            listDeletedPrograms: vi.fn().mockResolvedValue({
              items: [{ ...LIST_ITEM, deleted_at: "2026-10-24" }],
            }),
            restoreProgram,
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: RESTORE }));
    expect(
      await screen.findByText(restoredProgramToast("Knee program A")),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Create a new link/i }),
    ).not.toBeInTheDocument();
  });

  it("shows library updates to review flag from spec States line 23", async () => {
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [{ ...LIST_ITEM, library_updates_to_review: 2 }],
              matched_code: null,
            }),
          })}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText(libraryUpdatesToReviewFlag(2)!)).toBeInTheDocument();
  });

  it("shows singular library update flag for count 1 (mockups 01 and 29)", async () => {
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi.fn().mockResolvedValue({
              items: [{ ...LIST_ITEM, library_updates_to_review: 1 }],
              matched_code: null,
            }),
          })}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText(libraryUpdatesToReviewFlag(1)!)).toBeInTheDocument();
  });

  it("shows zero exercise card copy", async () => {
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({
            listPrograms: vi
              .fn()
              .mockResolvedValue({ items: [LIST_ITEM], matched_code: null }),
          })}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText(CARD_NO_EXERCISES_YET)).toBeInTheDocument();
  });

  it("clears search from no match state", async () => {
    const all = [LIST_ITEM];
    const listPrograms = vi.fn((q?: string) => {
      if (!q?.trim()) {
        return Promise.resolve({ items: all, matched_code: null });
      }
      return Promise.resolve({ items: [], matched_code: null });
    });
    render(
      <MemoryRouter initialEntries={["/programs?q=nomatch"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={stubProgramsClient({ listPrograms })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: CLEAR_SEARCH }));
  });
});
