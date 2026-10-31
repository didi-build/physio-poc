/**
 * @vitest-environment jsdom
 */
import { ensureMatchMediaStub, mockMinWidth1024 } from "./setup.js";
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
  ProgramListItem,
} from "../../src/services/programs/types.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  ensureMatchMediaStub();
});

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: vi.fn().mockResolvedValue({
      list_state: "ok",
      sections: { new_from_requests: [], pinned: [], recently_used_and_saved: [] },
    }),
    searchApproved: vi.fn(),
  } as unknown as ExerciseLibraryClient;
}

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
  const listItem: ProgramListItem = {
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

describe("Programs builder dev verification", () => {
  it("retries a failed reorder instead of the name save", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rows = [
      exerciseRow("row-a", "Alpha move"),
      exerciseRow("row-b", "Beta move"),
    ];
    rows[1]!.position = 2;
    const reorderRows = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue({ program: builderView({ rows }) });
    const updateProgramName = vi.fn();
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ rows, exercise_count: 2 })),
            reorderRows,
            updateProgramName,
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
      expect(reorderRows).toHaveBeenCalledTimes(1);
    });
    expect(screen.getAllByText("Not saved").length).toBeGreaterThan(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await waitFor(() => {
      expect(reorderRows).toHaveBeenCalledTimes(2);
    });
    expect(updateProgramName).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("saves notes on two rows without dropping the first edit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rows = [
      exerciseRow("row-a", "Alpha move"),
      exerciseRow("row-b", "Beta move"),
    ];
    rows[1]!.position = 2;
    const updateRow = vi.fn().mockImplementation(async (_id, rowId, patch) => ({
      program: builderView({
        rows: rows.map((row) =>
          row.id === rowId ? { ...row, note: patch.note ?? row.note } : row,
        ),
      }),
    }));
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ rows, exercise_count: 2 })),
            updateRow,
          })}
        />
      </MemoryRouter>,
    );
    const notes = await screen.findAllByLabelText("Notes for this exercise (optional)");
    await userEvent.type(notes[0]!, "one");
    await userEvent.type(notes[1]!, "two");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(2);
    });
    expect(updateRow).toHaveBeenCalledWith("prog-1", "row-a", { note: "one" });
    expect(updateRow).toHaveBeenCalledWith("prog-1", "row-b", { note: "two" });
    vi.useRealTimers();
  });

  it("saves a note edit and a name edit in the same session", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const row = exerciseRow("row-1", "Heel raise");
    const updateRow = vi.fn().mockResolvedValue({
      program: builderView({ rows: [{ ...row, note: "note" }] }),
    });
    const updateProgramName = vi.fn().mockResolvedValue({
      program: builderView({ name: "Knee program A" }),
    });
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(builderView({ rows: [row] })),
            updateRow,
            updateProgramName,
          })}
        />
      </MemoryRouter>,
    );
    const note = await screen.findByLabelText("Notes for this exercise (optional)");
    await userEvent.type(note, "note");
    const nameField = screen.getByRole("textbox", { name: "Program name" });
    await userEvent.type(nameField, "Knee program A");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalled();
      expect(updateProgramName).toHaveBeenCalled();
    });
    vi.useRealTimers();
  });

  it("does not overwrite a row note draft from a stale server response", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveRow: ((value: { program: ProgramBuilderView }) => void) | undefined;
    const row = exerciseRow("row-1", "Heel raise");
    const updateRow = vi.fn().mockImplementation(
      () =>
        new Promise<{ program: ProgramBuilderView }>((resolve) => {
          resolveRow = resolve;
        }),
    );
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
    const note = await screen.findByLabelText("Notes for this exercise (optional)");
    await userEvent.type(note, "ab");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await waitFor(() => expect(updateRow).toHaveBeenCalled());
    await userEvent.type(note, "c");
    await act(async () => {
      resolveRow?.({
        program: builderView({ rows: [{ ...row, note: "ab" }] }),
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(note).toHaveValue("abc");
    });
    vi.useRealTimers();
  });

  it("debounces row note saves", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const row = exerciseRow("row-1", "Heel raise");
    const updateRow = vi.fn().mockResolvedValue({
      program: builderView({ rows: [{ ...row, note: "ab" }] }),
    });
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
    const note = await screen.findByLabelText("Notes for this exercise (optional)");
    fireEvent.change(note, { target: { value: "ab" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalledTimes(1);
    });
    expect(updateRow).toHaveBeenCalledWith("prog-1", "row-1", { note: "ab" });
    vi.useRealTimers();
  });

  it("marks the builder dirty after a note edit for leave warning", async () => {
    const row = exerciseRow("row-1", "Heel raise");
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(builderView({ rows: [row] })),
            updateRow: vi.fn().mockImplementation(() => new Promise(() => {})),
          })}
        />
      </MemoryRouter>,
    );
    const note = await screen.findByLabelText("Notes for this exercise (optional)");
    await userEvent.type(note, "draft");
    await userEvent.click(screen.getByRole("button", { name: "Programs" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(
      "Leave without saving?",
    );
  });

  it("shows Not saved when a row type change fails", async () => {
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
    const typeSelect = within(
      await screen.findByRole("article", { name: /Heel raise/i }),
    ).getByRole("combobox", { name: "Heel raise" });
    await userEvent.selectOptions(typeSelect, "stretching");
    await waitFor(() => {
      expect(updateRow).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText("Not saved").length).toBeGreaterThan(0);
    });
  });

  it("shows the phone publish bar and a single alert on failed save", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    expect(screen.getAllByRole("button", { name: "Publish" }).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText(
        "Changes save automatically. When you publish, your patient sees them on the same share link. No need to send a new one.",
      ).length,
    ).toBeGreaterThan(0);
    await userEvent.type(nameField, "Knee program A");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(updateProgramName).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    });
    vi.useRealTimers();
  });

  it("renders delete sheet copy and card in mockup order when share link is open", async () => {
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(
              builderView({
                name: "Knee program A",
                code: "PRG-TEST",
                exercise_count: 2,
                open_share_link: true,
              }),
            ),
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete program" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Delete this program?" });
    expect(
      within(dialog).getByText("Knee program A", { selector: "h3" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Code PRG-TEST")).toBeInTheDocument();
    expect(within(dialog).getByText("2 exercises")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /It moves to Recently deleted\. You can restore it for 30 days/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'It also closes its share link, so anyone who opens it sees "This link was closed".',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "To stop sharing but keep the program, close the link on the Share screen instead.",
      ),
    ).toBeInTheDocument();
    const card = within(dialog).getByRole("article");
    const intro = within(dialog).getByText(/It moves to Recently deleted/);
    expect(
      card.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders delete sheet copy when the share link is already closed", async () => {
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(
              builderView({
                name: "Knee program A",
                open_share_link: false,
              }),
            ),
          })}
        />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete program" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Delete this program?" });
    expect(
      within(dialog).getByText("Its share link is already closed."),
    ).toBeInTheDocument();
  });

  it("exposes copy and trash row controls that fire actions", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "dup-id" });
    const rows = [exerciseRow("row-a", "Alpha move")];
    const duplicateRow = vi.fn().mockResolvedValue({
      program: builderView({ rows: [...rows, exerciseRow("dup-id", "Alpha move")] }),
    });
    const deleteRow = vi.fn().mockResolvedValue({ program: builderView({ rows: [] }) });
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ rows, exercise_count: 1 })),
            duplicateRow,
            deleteRow,
          })}
        />
      </MemoryRouter>,
    );
    const rowCard = await screen.findByRole("article", { name: /Alpha move/i });
    expect(within(rowCard).queryByText("Exercise types")).not.toBeInTheDocument();
    expect(
      within(rowCard).getByRole("combobox", { name: "Alpha move" }),
    ).toBeInTheDocument();
    expect(rowCard.querySelector(".pg-row-grip svg")).toBeTruthy();
    const up = within(rowCard).getByRole("button", {
      name: /Reorder Alpha move, position 1/,
    });
    const down = within(rowCard).getByRole("button", {
      name: /Reorder Alpha move, position 2/,
    });
    const actionBar = rowCard.querySelector(".pg-row-actions");
    expect(actionBar).toBeTruthy();
    const actionButtons = within(actionBar as HTMLElement).getAllByRole("button");
    expect(actionButtons[0]).toBe(up);
    expect(actionButtons[1]).toBe(down);
    expect(up.querySelector("svg path")?.getAttribute("d")).not.toBe(
      down.querySelector("svg path")?.getAttribute("d"),
    );
    expect(
      within(rowCard)
        .getByRole("button", { name: "Duplicate Alpha move" })
        .querySelector("svg"),
    ).toBeTruthy();
    expect(
      within(rowCard)
        .getByRole("button", { name: "Remove Alpha move" })
        .querySelector("svg"),
    ).toBeTruthy();
    await userEvent.click(
      within(rowCard).getByRole("button", { name: "Duplicate Alpha move" }),
    );
    await waitFor(() => expect(duplicateRow).toHaveBeenCalled());
    await userEvent.click(
      screen.getAllByRole("button", { name: "Remove Alpha move" })[0]!,
    );
    await waitFor(() => expect(deleteRow).toHaveBeenCalled());
  });

  it("shows placeholder row copy from the spec", async () => {
    const row: ProgramBuilderRow = {
      ...exerciseRow("ph-1", "Bridge marching"),
      kind: "placeholder",
      exercise_id: null,
      exercise_version_id: null,
      pinned_version_number: null,
      prescription_type: "concentric",
    };
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(builderView({ rows: [row] })),
          })}
        />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(
        "Placeholder. It links to the real exercise once you approve the draft.",
      ),
    ).toBeInTheDocument();
  });

  it("shows deleted program code and exercise count on the list", async () => {
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
            listDeletedPrograms: vi.fn().mockResolvedValue({
              items: [
                {
                  program_id: "p-del",
                  code: "PRG-DEL",
                  name: "Deleted program",
                  exercise_count: 3,
                  draft_updated_at: "2026-10-24T12:00:00.000Z",
                  auto_save_status: { kind: "not_published_yet" },
                  library_updates_to_review: 0,
                  deleted_at: "2026-10-24T12:00:00.000Z",
                  routine_origin: null,
                },
              ],
            }),
          })}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Code PRG-DEL")).toBeInTheDocument();
    expect(screen.getByText("3 exercises")).toBeInTheDocument();
  });

  it("formats published status with time like the mockups", async () => {
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi.fn().mockResolvedValue(
              builderView({
                auto_save_status: {
                  kind: "published",
                  published_at: "2026-10-24T18:10:00.000Z",
                },
              }),
            ),
          })}
        />
      </MemoryRouter>,
    );
    await screen.findByRole("textbox", { name: "Program name" });
    await waitFor(() => {
      const lines = document.querySelectorAll(".pg-publish-card-status");
      const text = Array.from(lines)
        .map((node) => node.textContent ?? "")
        .join(" ");
      expect(text).toMatch(/Published Oct 24, 2:10 PM/);
    });
  });

  it("mounts the failure alert on the phone status block below 1024px", async () => {
    mockMinWidth1024(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(updateProgramName).toHaveBeenCalled());
    expect(document.querySelector(".pg-autosave--phone [role=alert]")).toBeTruthy();
    expect(document.querySelector(".pg-autosave--desktop [role=alert]")).toBeNull();
    vi.useRealTimers();
  });

  it("mounts the failure alert on the desktop publish card at 1024px and up", async () => {
    mockMinWidth1024(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(updateProgramName).toHaveBeenCalled());
    expect(document.querySelector(".pg-autosave--desktop [role=alert]")).toBeTruthy();
    expect(document.querySelector(".pg-autosave--phone [role=alert]")).toBeNull();
    vi.useRealTimers();
  });

  it("shows the phone status card and fixed publish bar below 1024px", async () => {
    mockMinWidth1024(false);
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs()}
        />
      </MemoryRouter>,
    );
    await screen.findByRole("textbox", { name: "Program name" });
    const phoneStatusCard = document.querySelector(
      ".pg-builder-status-card--phone",
    ) as HTMLElement;
    expect(phoneStatusCard).toBeTruthy();
    expect(within(phoneStatusCard).getByText("Not published yet")).toBeInTheDocument();
    const bar = document.querySelector(".pg-publish-phone-bar");
    expect(bar).toBeTruthy();
    expect(
      within(bar as HTMLElement).getByText(
        "Changes save automatically. When you publish, your patient sees them on the same share link. No need to send a new one.",
      ),
    ).toBeInTheDocument();
    expect(
      within(bar as HTMLElement).getByRole("button", { name: "Publish" }),
    ).toBeTruthy();
  });

  it("keeps Not saved when another field saves after a reorder failure", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rows = [
      exerciseRow("row-a", "Alpha move"),
      exerciseRow("row-b", "Beta move"),
    ];
    rows[1]!.position = 2;
    const reorderRows = vi.fn().mockRejectedValue(new Error("fail"));
    const updateProgramName = vi.fn().mockResolvedValue({
      program: builderView({ name: "Knee program A", rows }),
    });
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ rows, exercise_count: 2 })),
            reorderRows,
            updateProgramName,
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
    await waitFor(() => expect(reorderRows).toHaveBeenCalled());
    const nameField = screen.getByRole("textbox", { name: "Program name" });
    await userEvent.type(nameField, "Knee program A");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(updateProgramName).toHaveBeenCalled());
    expect(screen.getAllByText("Not saved").length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("does not show Saved while a row note save is still in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const row = exerciseRow("row-1", "Heel raise");
    const updateRow = vi.fn().mockImplementation(
      () =>
        new Promise<{ program: ProgramBuilderView }>(() => {
          /* pending */
        }),
    );
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
    const note = await screen.findByLabelText("Notes for this exercise (optional)");
    await userEvent.type(note, "x");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await waitFor(() => expect(updateRow).toHaveBeenCalled());
    const statusLines = document.querySelectorAll(".pg-autosave-status");
    const statusText = Array.from(statusLines)
      .map((node) => node.textContent ?? "")
      .join(" ");
    expect(statusText).toContain("Saving...");
    expect(statusText).not.toContain("Saved");
    vi.useRealTimers();
  });

  it("stays Saving... after one row note save completes while another is still debounced", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rows = [
      exerciseRow("row-a", "Alpha move"),
      exerciseRow("row-b", "Beta move"),
    ];
    rows[1]!.position = 2;
    let finishAlphaSave: (() => void) | undefined;
    const updateRow = vi.fn().mockImplementation(async (_progId, rowId, patch) => {
      if (rowId === "row-a") {
        return new Promise<{ program: ProgramBuilderView }>((resolve) => {
          finishAlphaSave = () =>
            resolve({
              program: builderView({
                rows: rows.map((row) =>
                  row.id === rowId ? { ...row, note: patch.note ?? row.note } : row,
                ),
              }),
            });
        });
      }
      return {
        program: builderView({
          rows: rows.map((row) =>
            row.id === rowId ? { ...row, note: patch.note ?? row.note } : row,
          ),
        }),
      };
    });
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          programsClient={builderStubs({
            getProgram: vi
              .fn()
              .mockResolvedValue(builderView({ rows, exercise_count: 2 })),
            updateRow,
          })}
        />
      </MemoryRouter>,
    );
    const notes = await screen.findAllByLabelText("Notes for this exercise (optional)");
    await userEvent.type(notes[0]!, "alpha");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await waitFor(() =>
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-a", { note: "alpha" }),
    );
    await userEvent.type(notes[1]!, "beta");
    finishAlphaSave!();
    await act(async () => {
      await Promise.resolve();
    });
    const statusText = Array.from(document.querySelectorAll(".pg-autosave-status"))
      .map((node) => node.textContent ?? "")
      .join(" ");
    expect(statusText).toContain("Saving...");
    expect(statusText).not.toContain("Saved");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await waitFor(() =>
      expect(updateRow).toHaveBeenCalledWith("prog-1", "row-b", { note: "beta" }),
    );
    await waitFor(() => {
      const after = Array.from(document.querySelectorAll(".pg-autosave-status"))
        .map((node) => node.textContent ?? "")
        .join(" ");
      expect(after).toContain("Saved");
    });
    vi.useRealTimers();
  });
});

describe("Programs builder name draft race", () => {
  it("keeps Knee after a stale name save resolves", async () => {
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
    await waitFor(() => expect(updateProgramName).toHaveBeenCalled());
    await userEvent.type(nameField, "ee");
    expect(nameField).toHaveValue("Knee");
    await act(async () => {
      resolveSave?.({ program: builderView({ name: "Kn" }) });
    });
    await waitFor(() => expect(nameField).toHaveValue("Knee"));
  });
});
