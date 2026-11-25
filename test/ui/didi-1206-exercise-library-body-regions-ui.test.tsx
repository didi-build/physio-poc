/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import { PhysioApp } from "../../src/ui/App.js";
import type { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import type { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";
import type { RoutinesClient } from "../../src/ui/api/routines-client.js";
import { ALL_REGIONS } from "../../src/ui/copy/exercise-library.js";
import { EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE } from "./exercise-library-body-regions-fixture.js";

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

function stubRequestsClient(): ExerciseRequestsClient {
  return {
    getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
    listSimilar: vi.fn().mockResolvedValue({
      library_matches: [],
      drafts_in_progress: [],
    }),
  } as unknown as ExerciseRequestsClient;
}

describe("DIDI-1206 exercise library body region pills (UI)", () => {
  it("calls listMeBodyRegions once and shows Knee in the filter panel", async () => {
    const listMeBodyRegions = vi
      .fn()
      .mockResolvedValue([...EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE]);
    const routinesClient = { listMeBodyRegions } as unknown as RoutinesClient;

    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exerciseSearch")]}>
        <PhysioApp
          exerciseLibraryClient={emptyExerciseLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          routinesClient={routinesClient}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalledTimes(1);
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filters & sort/i }));

    expect(await screen.findByRole("button", { name: "Knee" })).toBeInTheDocument();
  });

  it("when listMeBodyRegions fails, shows only All regions and approved search still runs", async () => {
    const listMeBodyRegions = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const searchApproved = vi.fn().mockResolvedValue({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    });
    const routinesClient = { listMeBodyRegions } as unknown as RoutinesClient;

    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exerciseSearch")]}>
        <PhysioApp
          exerciseLibraryClient={emptyExerciseLibraryClient({ searchApproved })}
          exerciseRequestsClient={stubRequestsClient()}
          routinesClient={routinesClient}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(searchApproved).toHaveBeenCalled();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filters & sort/i }));

    expect(screen.getByRole("button", { name: ALL_REGIONS })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Knee" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hip" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ankle" })).not.toBeInTheDocument();
  });
});
