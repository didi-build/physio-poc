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
import type { ProgramListItem } from "../../src/services/programs/types.js";
import {
  CLEAR_SEARCH,
  FILTER_FROM_SCRATCH,
  FILTER_FROM_ROUTINE,
  NEW_PROGRAM,
  PROGRAMS_EMPTY_HEADING,
  PROGRAMS_EMPTY_HELPER,
  PROGRAMS_PAGE_TITLE,
  SEARCH_BY_NAME_OR_CODE,
  programsSearchNoMatch,
} from "../../src/ui/copy/programs.js";
import { mockMinWidth1024 } from "./setup.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  vi.restoreAllMocks();
});

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: vi.fn().mockResolvedValue({
      list_state: "ok",
      sections: {
        new_from_requests: [],
        pinned: [],
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
  exercise_count: 2,
  draft_updated_at: "2026-10-24T12:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" },
  library_updates_to_review: 0,
  share_link_status: "none",
  last_sent_at: "2026-10-24T12:00:00.000Z",
  deleted_at: null,
  routine_origin: null,
};

function renderProgramsAt(
  programsClient: ProgramsClient,
  path = "/programs",
  widthPx = 1280,
) {
  mockMinWidth1024(widthPx >= 1024);
  const container = document.createElement("div");
  container.style.width = `${widthPx}px`;
  document.body.appendChild(container);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        programsClient={programsClient}
      />
    </MemoryRouter>,
    { container },
  );
}

function stubProgramsClient(overrides: Partial<ProgramsClient> = {}): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    ...overrides,
  } as unknown as ProgramsClient;
}

function expectControlsVisible(scope: HTMLElement) {
  expect(within(scope).getByText(SEARCH_BY_NAME_OR_CODE)).toBeVisible();
  expect(within(scope).getByRole("button", { name: "All" })).toBeVisible();
  expect(
    within(scope).getByRole("button", { name: FILTER_FROM_ROUTINE }),
  ).toBeVisible();
  expect(
    within(scope).getByRole("button", { name: FILTER_FROM_SCRATCH }),
  ).toBeVisible();
}

describe.each([390, 1280])(
  "Programs persistent list controls (DIDI-1179, %i px)",
  (widthPx) => {
    it("keeps search and origin filters visible after load resolves to zero programs", async () => {
      renderProgramsAt(stubProgramsClient(), "/programs", widthPx);
      const main = await screen.findByRole("heading", { name: PROGRAMS_PAGE_TITLE });
      void main;
      await waitFor(() => {
        expect(screen.getByTestId("programs-list-controls")).toBeVisible();
      });
      const shellMain = document.querySelector(".shell-main") as HTMLElement;
      expectControlsVisible(shellMain);
      const empty = await screen.findByTestId("programs-empty");
      expect(within(empty).getByRole("heading", { level: 2 })).toHaveTextContent(
        PROGRAMS_EMPTY_HEADING,
      );
      expect(screen.getByText(PROGRAMS_EMPTY_HELPER)).toBeInTheDocument();
      expect(
        within(empty).getByRole("button", { name: NEW_PROGRAM }),
      ).toBeInTheDocument();
      expectControlsVisible(shellMain);
    });

    it("does not show the zero-program empty block while loading", async () => {
      let resolveList!: (value: {
        items: ProgramListItem[];
        matched_code: string | null;
      }) => void;
      const listPrograms = vi.fn(
        () =>
          new Promise<{
            items: ProgramListItem[];
            matched_code: string | null;
          }>((resolve) => {
            resolveList = resolve;
          }),
      );
      renderProgramsAt(
        stubProgramsClient({
          listPrograms,
          listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
        }),
        "/programs",
        widthPx,
      );
      await screen.findByRole("heading", { name: PROGRAMS_PAGE_TITLE });
      await waitFor(() => expect(listPrograms).toHaveBeenCalled());
      expect(screen.queryByTestId("programs-empty")).not.toBeInTheDocument();
      resolveList({ items: [], matched_code: null });
      await screen.findByTestId("programs-empty");
    });

    it("shows controls while the list is still loading", async () => {
      let resolveList!: (value: {
        items: ProgramListItem[];
        matched_code: string | null;
      }) => void;
      const listPrograms = vi.fn(
        () =>
          new Promise<{
            items: ProgramListItem[];
            matched_code: string | null;
          }>((resolve) => {
            resolveList = resolve;
          }),
      );
      renderProgramsAt(
        stubProgramsClient({
          listPrograms,
          listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
        }),
        "/programs",
        widthPx,
      );
      await screen.findByRole("heading", { name: PROGRAMS_PAGE_TITLE });
      await waitFor(() => expect(listPrograms).toHaveBeenCalled());
      const shellMain = document.querySelector(".shell-main") as HTMLElement;
      expectControlsVisible(shellMain);
      resolveList({ items: [], matched_code: null });
      await screen.findByTestId("programs-empty");
      expectControlsVisible(shellMain);
    });

    it("keeps controls and query when search returns zero matches", async () => {
      const listPrograms = vi.fn().mockImplementation((q?: string) => {
        if (q?.trim()) {
          return Promise.resolve({ items: [], matched_code: null });
        }
        return Promise.resolve({ items: [LIST_ITEM], matched_code: null });
      });
      renderProgramsAt(
        stubProgramsClient({ listPrograms }),
        "/programs?q=nomatch",
        widthPx,
      );
      const shellMain = document.querySelector(".shell-main") as HTMLElement;
      await screen.findByText(programsSearchNoMatch("nomatch"));
      expectControlsVisible(shellMain);
      expect(
        within(shellMain).getByRole("searchbox", { name: /search programs/i }),
      ).toHaveValue("nomatch");
      expect(screen.getByRole("button", { name: CLEAR_SEARCH })).toBeInTheDocument();
    });

    it("keeps controls, filter selection, and populated cards", async () => {
      const user = userEvent.setup();
      const listPrograms = vi
        .fn()
        .mockImplementation((_q?: string, origin?: string) => {
          if (origin === "from_scratch") {
            return Promise.resolve({ items: [LIST_ITEM], matched_code: null });
          }
          return Promise.resolve({ items: [LIST_ITEM], matched_code: null });
        });
      renderProgramsAt(stubProgramsClient({ listPrograms }), "/programs", widthPx);
      const shellMain = document.querySelector(".shell-main") as HTMLElement;
      await screen.findByRole("link", { name: "Knee program A" });
      expectControlsVisible(shellMain);
      await user.click(
        within(shellMain).getByRole("button", { name: FILTER_FROM_SCRATCH }),
      );
      await waitFor(() => {
        expect(listPrograms).toHaveBeenCalledWith(
          undefined,
          "from_scratch",
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
      });
      expect(
        within(shellMain).getByRole("button", {
          name: FILTER_FROM_SCRATCH,
          pressed: true,
        }),
      ).toBeVisible();
    });
  },
);
