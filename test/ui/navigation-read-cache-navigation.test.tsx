/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  RoutinesClient,
  setRoutinesClientForTests,
} from "../../src/ui/api/routines-client.js";
import { PROGRAMS_PAGE_TITLE } from "../../src/ui/copy/programs.js";
import { ROUTINES_PAGE_TITLE } from "../../src/ui/copy/routines.js";
import {
  NAV_TAB_EXERCISES,
  NAV_TAB_PROGRAMS,
  NAV_TAB_ROUTINES,
} from "../../src/ui/copy/nav.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
  setRoutinesClientForTests(null);
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

function stubRequestsClient(): ExerciseRequestsClient {
  return {
    listInProgress: vi.fn().mockResolvedValue({ items: [] }),
    getInProgressCount: vi.fn().mockResolvedValue({ count: 0 }),
  } as unknown as ExerciseRequestsClient;
}

describe("navigation read cache navigation (DIDI-1185)", () => {
  it("revisit programs without extra listPrograms calls", async () => {
    const listPrograms = vi.fn().mockResolvedValue({ items: [], matched_code: null });
    const listDeletedPrograms = vi.fn().mockResolvedValue({ items: [] });
    const programsClient = {
      listPrograms,
      listDeletedPrograms,
    } as unknown as ProgramsClient;

    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <Routes>
          <Route
            path="/*"
            element={
              <PhysioApp
                exerciseLibraryClient={stubLibraryClient()}
                exerciseRequestsClient={stubRequestsClient()}
                programsClient={programsClient}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(listPrograms).toHaveBeenCalled());
    expect(listDeletedPrograms).toHaveBeenCalled();
    listPrograms.mockClear();
    listDeletedPrograms.mockClear();

    const user = userEvent.setup();
    const mainNav = screen.getAllByRole("navigation", { name: "Main" })[0]!;
    await user.click(within(mainNav).getByRole("link", { name: NAV_TAB_EXERCISES }));
    await waitFor(() => expect(listPrograms).not.toHaveBeenCalled());

    await user.click(within(mainNav).getByRole("link", { name: NAV_TAB_PROGRAMS }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: PROGRAMS_PAGE_TITLE })).toBeVisible();
    });
    expect(listPrograms).not.toHaveBeenCalled();
    expect(listDeletedPrograms).not.toHaveBeenCalled();
  });

  it("revisit routines without extra community search calls", async () => {
    const searchCommunity = vi.fn().mockResolvedValue({
      routines: [],
      next_cursor: null,
      search_link: null,
      total_count: 2,
      conditions_available: false,
      condition_options: [],
    });
    const listMyRoutines = vi.fn().mockResolvedValue({
      drafts: [],
      saved: [],
      flagged_count: 0,
      conditions_available: false,
      condition_options: [],
    });
    const routinesClient = {
      searchCommunity,
      listMyRoutines,
    } as unknown as RoutinesClient;
    const programsClient = {
      listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
      listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ProgramsClient;

    render(
      <MemoryRouter initialEntries={["/routines"]}>
        <Routes>
          <Route
            path="/*"
            element={
              <PhysioApp
                exerciseLibraryClient={stubLibraryClient()}
                exerciseRequestsClient={stubRequestsClient()}
                programsClient={programsClient}
                routinesClient={routinesClient}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(searchCommunity).toHaveBeenCalled());
    searchCommunity.mockClear();

    const user = userEvent.setup();
    const mainNav = screen.getAllByRole("navigation", { name: "Main" })[0]!;
    await user.click(within(mainNav).getByRole("link", { name: NAV_TAB_PROGRAMS }));
    await user.click(within(mainNav).getByRole("link", { name: NAV_TAB_ROUTINES }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: ROUTINES_PAGE_TITLE })).toBeVisible();
    });
    expect(searchCommunity).not.toHaveBeenCalled();
  });
});
