/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import { PhysioApp } from "../../src/ui/App.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import type { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import type { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";
import type { RoutinesClient } from "../../src/ui/api/routines-client.js";
import { BODY_REGION } from "../../src/ui/copy/exercise-library.js";
import { NAV_TAB_EXERCISES, NAV_TAB_PROGRAMS } from "../../src/ui/copy/nav.js";
import { PROGRAMS_PAGE_TITLE } from "../../src/ui/copy/programs.js";
import {
  FAKE_UI_SESSION_B_ID,
  FAKE_UI_DISPLAY_NAME_B,
  fakeUiSessionView,
  stubPractitionerSessionClient,
} from "./fake-practitioner-session-fixture.js";
import {
  EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE,
  EXERCISE_LIBRARY_REGION_PILL_LABELS,
} from "./exercise-library-body-regions-fixture.js";

afterEach(() => {
  cleanup();
});

function emptyExerciseLibraryClient(
  overrides: Partial<ExerciseLibraryClient> = {},
): ExerciseLibraryClient {
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
    ...overrides,
  } as unknown as ExerciseLibraryClient;
}

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
  } as unknown as ProgramsClient;
}

function renderExerciseLibraryApp(
  initialEntry: string,
  routinesClient: RoutinesClient,
  options: {
    practitionerSessionClient?: ReturnType<typeof stubPractitionerSessionClient>;
    exerciseLibraryClient?: ExerciseLibraryClient;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/*"
          element={
            <PhysioApp
              exerciseLibraryClient={
                options.exerciseLibraryClient ?? emptyExerciseLibraryClient()
              }
              exerciseRequestsClient={stubRequestsClient()}
              programsClient={stubProgramsClient()}
              routinesClient={routinesClient}
              practitionerSessionClient={
                options.practitionerSessionClient ?? stubPractitionerSessionClient()
              }
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function stubRequestsClient(): ExerciseRequestsClient {
  return {
    getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
    listSimilar: vi.fn().mockResolvedValue({
      library_matches: [],
      drafts_in_progress: [],
    }),
  } as unknown as ExerciseRequestsClient;
}

async function openFiltersAndReadRegionPillLabels(): Promise<string[]> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Filters & sort/i }));
  const regionGroup = await screen.findByRole("group", {
    name: BODY_REGION,
  });
  return within(regionGroup)
    .getAllByRole("button")
    .map((button) => button.textContent ?? "");
}

describe("DIDI-1206 exercise library body region pills (UI)", () => {
  it("calls listMeBodyRegions once and renders region pills in order", async () => {
    const listMeBodyRegions = vi
      .fn()
      .mockResolvedValue([...EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE]);
    const routinesClient = { listMeBodyRegions } as unknown as RoutinesClient;

    renderExerciseLibraryApp(
      fillPhysioAppRoutePattern("exerciseSearch"),
      routinesClient,
    );

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalledTimes(1);
    });

    const labels = await openFiltersAndReadRegionPillLabels();
    expect(labels).toEqual([...EXERCISE_LIBRARY_REGION_PILL_LABELS]);
  });

  it("reuses session read cache for body regions when revisiting the library in one session", async () => {
    const listMeBodyRegions = vi
      .fn()
      .mockResolvedValue([...EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE]);
    const routinesClient = { listMeBodyRegions } as unknown as RoutinesClient;

    renderExerciseLibraryApp(
      fillPhysioAppRoutePattern("exerciseSearch"),
      routinesClient,
    );

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalledTimes(1);
    });

    const user = userEvent.setup();
    const mainNav = screen.getAllByRole("navigation", { name: "Main" })[0]!;
    await user.click(within(mainNav).getByRole("link", { name: NAV_TAB_PROGRAMS }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: PROGRAMS_PAGE_TITLE })).toBeVisible();
    });

    await user.click(within(mainNav).getByRole("link", { name: NAV_TAB_EXERCISES }));
    await user.click(screen.getByRole("tab", { name: "All exercises" }));

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalledTimes(1);
    });

    const labels = await openFiltersAndReadRegionPillLabels();
    expect(labels).toEqual([...EXERCISE_LIBRARY_REGION_PILL_LABELS]);
  });

  it("refetches body regions after practitioner session changes", async () => {
    const listMeBodyRegions = vi
      .fn()
      .mockResolvedValue([...EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE]);

    renderExerciseLibraryApp(fillPhysioAppRoutePattern("exerciseSearch"), {
      listMeBodyRegions,
    } as unknown as RoutinesClient);

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalledTimes(1);
    });

    cleanup();

    renderExerciseLibraryApp(
      fillPhysioAppRoutePattern("exerciseSearch"),
      { listMeBodyRegions } as unknown as RoutinesClient,
      {
        practitionerSessionClient: stubPractitionerSessionClient(
          fakeUiSessionView({
            practitioner_id: FAKE_UI_SESSION_B_ID,
            display_name: FAKE_UI_DISPLAY_NAME_B,
          }),
        ),
      },
    );

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalledTimes(2);
    });
  });

  it("when listMeBodyRegions fails, shows only All regions, search still runs, and rejection is handled", async () => {
    const rejections: unknown[] = [];
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      rejections.push(event.reason);
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const listMeBodyRegions = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const searchApproved = vi.fn().mockResolvedValue({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    });
    const routinesClient = { listMeBodyRegions } as unknown as RoutinesClient;

    try {
      renderExerciseLibraryApp(
        fillPhysioAppRoutePattern("exerciseSearch"),
        routinesClient,
        {
          exerciseLibraryClient: emptyExerciseLibraryClient({ searchApproved }),
        },
      );

      await waitFor(() => {
        expect(listMeBodyRegions).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(searchApproved).toHaveBeenCalled();
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      const labels = await openFiltersAndReadRegionPillLabels();
      expect(labels).toEqual(["All regions"]);
      expect(rejections).toEqual([]);
      expect(
        screen.getByRole("heading", { name: "Exercise library" }),
      ).toBeInTheDocument();
    } finally {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    }
  });

  it("when listMeBodyRegions returns a non-array, shows only All regions", async () => {
    const listMeBodyRegions = vi.fn().mockResolvedValue({ not: "a-list" });
    const routinesClient = { listMeBodyRegions } as unknown as RoutinesClient;

    renderExerciseLibraryApp(
      fillPhysioAppRoutePattern("exerciseSearch"),
      routinesClient,
    );

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalledTimes(1);
    });

    const labels = await openFiltersAndReadRegionPillLabels();
    expect(labels).toEqual(["All regions"]);
  });
});
