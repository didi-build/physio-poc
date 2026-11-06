/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
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
  ALL_ROUTINES_EMPTY_HEADING,
  MY_ROUTINES_EMPTY_HEADING,
  MY_ROUTINES_INTRO,
  ROUTINES_PAGE_TITLE,
  ROUTINES_TAB_ALL,
  ROUTINES_TAB_MY,
  allRoutinesIntro,
} from "../../src/ui/copy/routines.js";
import {
  RoutinesPageContent,
  type RoutinesListItem,
} from "../../src/ui/routines/RoutinesPage.js";
import { mockMinWidth1024 } from "./setup.js";
import { vi } from "vitest";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
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
  });

  it("shows the approved empty state on the default All routines tab", () => {
    renderAppAt("/routines");
    const empty = screen.getByTestId("routines-empty");
    expect(within(empty).getByRole("heading", { level: 2 })).toHaveTextContent(
      ALL_ROUTINES_EMPTY_HEADING,
    );
    expect(screen.getByText(allRoutinesIntro(0))).toBeInTheDocument();
  });

  it("shows the approved My routines empty state when that tab is selected", async () => {
    const user = userEvent.setup();
    renderAppAt("/routines");
    await user.click(screen.getByRole("tab", { name: ROUTINES_TAB_MY }));
    const empty = screen.getByTestId("routines-empty");
    expect(within(empty).getByRole("heading", { level: 2 })).toHaveTextContent(
      MY_ROUTINES_EMPTY_HEADING,
    );
    expect(screen.getByText(MY_ROUTINES_INTRO)).toBeInTheDocument();
  });

  it("renders a populated list when items are provided", () => {
    const items: RoutinesListItem[] = [
      { routine_id: "rt-1", name: "Knee osteoarthritis, starter" },
    ];
    render(<RoutinesPageContent tab="all" onTabChange={() => {}} items={items} />);
    expect(screen.queryByTestId("routines-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("routines-list")).toHaveTextContent(
      "Knee osteoarthritis, starter",
    );
  });

  it("shows routines content inside the shell main region at 390 px width", () => {
    const { container } = renderAppAt("/routines", 390);
    const main = container.querySelector(".shell-main");
    expect(main).toBeTruthy();
    expect(within(main as HTMLElement).getByTestId("routines-page")).toBeVisible();
    expect(
      within(main as HTMLElement).getByRole("tab", { name: ROUTINES_TAB_ALL }),
    ).toBeInTheDocument();
  });
});
