/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
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
import {
  ALL_ROUTINES_EMPTY_HEADING,
  MY_ROUTINES_EMPTY_HEADING,
  MY_ROUTINES_INTRO,
  ROUTINES_PAGE_TITLE,
  ROUTINES_TAB_MY,
  SEARCH_ROUTINES_LABEL,
  allRoutinesIntro,
} from "../../src/ui/copy/routines.js";
import { mockMinWidth1024 } from "./setup.js";

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

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
  } as unknown as ProgramsClient;
}

function stubRequestsClient(): ExerciseRequestsClient {
  return {
    listInProgress: vi.fn().mockResolvedValue({ items: [] }),
    getInProgressCount: vi.fn().mockResolvedValue({ count: 0 }),
  } as unknown as ExerciseRequestsClient;
}

function stubRoutinesClient(): RoutinesClient {
  return {
    searchCommunity: vi.fn().mockResolvedValue({
      routines: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
      conditions_available: false,
      condition_options: [],
    }),
    listMyRoutines: vi.fn().mockResolvedValue({
      drafts: [],
      saved: [],
      flagged_count: 0,
      conditions_available: false,
      condition_options: [],
    }),
  } as unknown as RoutinesClient;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAppAt(path: string, widthPx = 1280) {
  mockMinWidth1024(widthPx >= 1024);
  const container = document.createElement("div");
  container.style.width = `${widthPx}px`;
  document.body.appendChild(container);
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient()}
        programsClient={stubProgramsClient()}
        routinesClient={stubRoutinesClient()}
      />
      <LocationProbe />
    </MemoryRouter>,
    { container },
  );
  return { ...view, container };
}

describe("Routines route (DIDI-1174)", () => {
  it("renders the routines page on /routines instead of a blank outlet", () => {
    renderAppAt("/routines");
    expect(screen.getByTestId("location")).toHaveTextContent("/routines");
    expect(screen.getByTestId("routines-page")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: ROUTINES_PAGE_TITLE }),
    ).toBeVisible();
    expect(screen.getByLabelText(SEARCH_ROUTINES_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters & sort/ })).toBeInTheDocument();
  });

  it("shows the approved empty state on the default All routines tab", async () => {
    renderAppAt("/routines");
    const empty = await screen.findByTestId("routines-empty");
    expect(within(empty).getByRole("heading", { level: 2 })).toHaveTextContent(
      ALL_ROUTINES_EMPTY_HEADING,
    );
    expect(screen.getByText(allRoutinesIntro(0))).toBeInTheDocument();
  });

  it("shows the approved My routines empty state when that tab is selected", async () => {
    const user = userEvent.setup();
    renderAppAt("/routines");
    await user.click(screen.getByRole("tab", { name: ROUTINES_TAB_MY }));
    const empty = await screen.findByTestId("routines-empty");
    expect(within(empty).getByRole("heading", { level: 2 })).toHaveTextContent(
      MY_ROUTINES_EMPTY_HEADING,
    );
    expect(screen.getByText(MY_ROUTINES_INTRO)).toBeInTheDocument();
  });

  it("navigates to Routines from the phone tab bar at 390 px and shows the approved empty state", async () => {
    const user = userEvent.setup();
    const { container } = renderAppAt("/exercises", 390);
    const tabNav = screen.getAllByRole("navigation", { name: "Main" })[1];

    await user.click(within(tabNav).getByRole("link", { name: "Routines" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/routines");
    const main = container.querySelector(".shell-main");
    expect(main).toBeTruthy();
    expect(
      within(main as HTMLElement).getByRole("heading", {
        level: 1,
        name: ROUTINES_PAGE_TITLE,
      }),
    ).toBeVisible();
    const empty = await within(main as HTMLElement).findByTestId("routines-empty");
    expect(within(empty).getByRole("heading", { level: 2 })).toHaveTextContent(
      ALL_ROUTINES_EMPTY_HEADING,
    );
  });
});
