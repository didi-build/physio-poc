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
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  RoutinesClient,
  setRoutinesClientForTests,
} from "../../src/ui/api/routines-client.js";
import { ALL_ROUTINES_EMPTY_HEADING, BODY_REGION } from "../../src/ui/copy/routines.js";
import {
  ROUTINES_LIBRARY_BODY_REGIONS_FIXTURE,
  stubListMeBodyRegionsResolved,
} from "./routines-library-body-regions-fixture.js";

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

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
  } as unknown as ProgramsClient;
}

function emptySearch() {
  return {
    routines: [],
    next_cursor: null,
    search_link: null,
    total_count: 0,
    conditions_available: false,
    condition_options: [],
  };
}

function emptyMy() {
  return {
    drafts: [],
    saved: [],
    flagged_count: 0,
    conditions_available: false,
    condition_options: [],
  };
}

function bodyRegionFilterGroup() {
  const label = screen.getByText(BODY_REGION);
  const group = label.parentElement?.querySelector('[role="group"]');
  expect(group).toBeTruthy();
  return group as HTMLElement;
}

function renderRoutinesPage(client: RoutinesClient) {
  return render(
    <MemoryRouter initialEntries={["/routines"]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient()}
        programsClient={stubProgramsClient()}
        routinesClient={client}
      />
    </MemoryRouter>,
  );
}

describe("DIDI-1211 routines library region pills", () => {
  it("loads region pills from listMeBodyRegions and hides unseeded regions", async () => {
    const listMeBodyRegions = vi
      .fn()
      .mockResolvedValue([...ROUTINES_LIBRARY_BODY_REGIONS_FIXTURE]);
    const client = {
      searchCommunity: vi.fn().mockResolvedValue(emptySearch()),
      listMyRoutines: vi.fn().mockResolvedValue(emptyMy()),
      listMeBodyRegions,
    } as unknown as RoutinesClient;

    const user = userEvent.setup();
    renderRoutinesPage(client);

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: /Filters & sort/ }));

    const group = bodyRegionFilterGroup();
    expect(
      within(group).getByRole("button", { name: "All regions" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalled();
      expect(within(group).queryByRole("button", { name: "Knee" })).not.toBeNull();
    });
    expect(within(group).getByRole("button", { name: "Hip" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Ankle" })).toBeInTheDocument();
    expect(
      within(group).queryByRole("button", { name: "Shoulder" }),
    ).not.toBeInTheDocument();
    expect(
      within(group).queryByRole("button", { name: "Neck" }),
    ).not.toBeInTheDocument();
  });

  it("passes lowercase body_region from the selected pill to community search", async () => {
    const listMeBodyRegions = stubListMeBodyRegionsResolved();
    const searchCommunity = vi.fn().mockResolvedValue(emptySearch());
    const client = {
      searchCommunity,
      listMyRoutines: vi.fn().mockResolvedValue(emptyMy()),
      listMeBodyRegions,
    } as unknown as RoutinesClient;

    const user = userEvent.setup();
    renderRoutinesPage(client);

    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: /Filters & sort/ }));
    const group = bodyRegionFilterGroup();
    await waitFor(() => {
      expect(within(group).queryByRole("button", { name: "Knee" })).not.toBeNull();
    });
    await user.click(within(group).getByRole("button", { name: "Knee" }));

    await waitFor(() => {
      expect(searchCommunity).toHaveBeenCalledWith(
        expect.objectContaining({ body_region: "knee" }),
        expect.anything(),
      );
    });
  });

  it("keeps only All regions when listMeBodyRegions rejects and still loads the routines list", async () => {
    const listMeBodyRegions = vi.fn().mockRejectedValue(new Error("regions_failed"));
    const searchCommunity = vi.fn().mockResolvedValue(emptySearch());
    const client = {
      searchCommunity,
      listMyRoutines: vi.fn().mockResolvedValue(emptyMy()),
      listMeBodyRegions,
    } as unknown as RoutinesClient;

    const user = userEvent.setup();
    renderRoutinesPage(client);

    await waitFor(() => {
      expect(searchCommunity).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(listMeBodyRegions).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: /Filters & sort/ }));

    const group = bodyRegionFilterGroup();
    expect(
      within(group).getByRole("button", { name: "All regions" }),
    ).toBeInTheDocument();
    expect(within(group).queryByRole("button", { name: "Knee" })).toBeNull();
    expect(within(group).queryByRole("button", { name: "Hip" })).toBeNull();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: ALL_ROUTINES_EMPTY_HEADING }),
      ).toBeInTheDocument();
    });
  });
});
