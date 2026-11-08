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
import {
  ALL_ROUTINES_EMPTY_HEADING,
  CONDITION,
  KEEP_MINE,
  MY_ROUTINES_EMPTY_HEADING,
  MY_ROUTINES_INTRO,
  ROUTINES_TAB_MY,
  SEARCH_ROUTINES_LABEL,
  allRoutinesIntro,
  flaggedBanner,
  CREATE_PROGRAM_FROM_ROUTINE,
  toastAdoptedVersion,
  toastKeptCopy,
  toastRemovedFromMy,
  toastSavedToMy,
  useVersionN,
} from "../../src/ui/copy/routines.js";
import { TOAST_UNDO } from "../../src/ui/copy/nav.js";

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

function renderRoutines(client: RoutinesClient, path = "/routines") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient()}
        programsClient={stubProgramsClient()}
        routinesClient={client}
      />
    </MemoryRouter>,
  );
}

describe("Routines library UI (DIDI-1022)", () => {
  it("keeps search and filters above empty All routines state", async () => {
    const client = {
      searchCommunity: vi.fn().mockResolvedValue(emptySearch()),
      listMyRoutines: vi.fn().mockResolvedValue(emptyMy()),
    } as unknown as RoutinesClient;
    renderRoutines(client);

    expect(screen.getByLabelText(SEARCH_ROUTINES_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters & sort/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("routines-empty")).toBeInTheDocument();
    });
    const main = screen.getByTestId("routines-library-main");
    expect(
      within(main).getByRole("heading", { level: 2, name: ALL_ROUTINES_EMPTY_HEADING }),
    ).toBeInTheDocument();
  });

  it("keeps search and filters above empty My routines state", async () => {
    const client = {
      searchCommunity: vi.fn().mockResolvedValue(emptySearch()),
      listMyRoutines: vi.fn().mockResolvedValue(emptyMy()),
    } as unknown as RoutinesClient;
    const user = userEvent.setup();
    renderRoutines(client);
    await user.click(screen.getByRole("tab", { name: ROUTINES_TAB_MY }));

    expect(screen.getByLabelText("Search my routines")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("routines-empty")).toBeInTheDocument();
    });
    expect(screen.getByText(MY_ROUTINES_INTRO)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: MY_ROUTINES_EMPTY_HEADING }),
    ).toBeInTheDocument();
  });

  it("hides condition filter when conditions_available is false", async () => {
    const client = {
      searchCommunity: vi.fn().mockResolvedValue(emptySearch()),
      listMyRoutines: vi.fn().mockResolvedValue(emptyMy()),
    } as unknown as RoutinesClient;
    const user = userEvent.setup();
    renderRoutines(client);
    await user.click(screen.getByRole("button", { name: /Filters & sort/ }));
    expect(screen.queryByText(CONDITION)).not.toBeInTheDocument();
  });

  it("shows condition filter when conditions_available is true", async () => {
    const client = {
      searchCommunity: vi.fn().mockResolvedValue({
        ...emptySearch(),
        conditions_available: true,
        condition_options: [{ condition_id: "c1", label: "Arthritis" }],
      }),
      listMyRoutines: vi.fn().mockResolvedValue(emptyMy()),
    } as unknown as RoutinesClient;
    const user = userEvent.setup();
    renderRoutines(client);
    await waitFor(() => {
      expect(client.searchCommunity).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: /Filters & sort/ }));
    expect(screen.getByText(CONDITION)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arthritis" })).toBeInTheDocument();
  });

  it("shows the flagged-count banner on My routines when flagged_count is positive", async () => {
    const client = {
      searchCommunity: vi.fn().mockResolvedValue(emptySearch()),
      listMyRoutines: vi.fn().mockResolvedValue({
        ...emptyMy(),
        flagged_count: 1,
        saved: [
          {
            routine_id: "r1",
            name: "Knee starter",
            saved_copy_version: 1,
            community_version: 2,
            edited: false,
            saved_at: "2026-10-25T12:00:00.000Z",
            last_used_at: null,
            community_updated: true,
            body_region_label: "Knee",
            condition_label: null,
            exercise_count: 2,
          },
        ],
      }),
    } as unknown as RoutinesClient;
    const user = userEvent.setup();
    renderRoutines(client);
    await user.click(screen.getByRole("tab", { name: ROUTINES_TAB_MY }));
    await waitFor(() => {
      expect(screen.getByTestId("routines-flag-banner")).toHaveTextContent(
        flaggedBanner(1),
      );
    });
  });

  it("passes search query to the community API", async () => {
    const client = {
      searchCommunity: vi.fn().mockResolvedValue({
        ...emptySearch(),
        total_count: 1,
        routines: [
          {
            routine_id: "r1",
            routine_version_id: "rv1",
            name: "Knee starter",
            version_number: 1,
            body_region_label: "Knee",
            condition_label: null,
            exercise_count: 2,
            usage_count: 1,
            added_by_you: false,
            in_my_routines: false,
          },
        ],
      }),
      listMyRoutines: vi.fn().mockResolvedValue(emptyMy()),
    } as unknown as RoutinesClient;
    const user = userEvent.setup();
    renderRoutines(client);
    const input = screen.getByLabelText(SEARCH_ROUTINES_LABEL);
    await user.type(input, "knee");
    await waitFor(() => {
      expect(client.searchCommunity).toHaveBeenCalledWith(
        expect.objectContaining({ q: "knee" }),
      );
    });
    expect(screen.getByText(allRoutinesIntro(1))).toBeInTheDocument();
  });

  it("save from All routines shows toast with undo", async () => {
    const undo = {
      practitioner_id: "p1",
      routine_id: "r1",
      snapshot: { had_copy: false, copy: null },
    };
    const client = {
      searchCommunity: vi.fn().mockResolvedValue({
        ...emptySearch(),
        total_count: 1,
        routines: [
          {
            routine_id: "r1",
            routine_version_id: "rv1",
            name: "Knee starter",
            version_number: 1,
            body_region_label: "Knee",
            condition_label: null,
            exercise_count: 2,
            usage_count: 1,
            added_by_you: false,
            in_my_routines: false,
          },
        ],
      }),
      listMyRoutines: vi.fn().mockResolvedValue(emptyMy()),
      saveToMyRoutines: vi.fn().mockResolvedValue({ undo }),
      applyUndo: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as RoutinesClient;
    const user = userEvent.setup();
    renderRoutines(client);
    await waitFor(() => {
      expect(screen.getByText("Knee starter")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Save Knee starter/ }));
    expect(await screen.findByText(toastSavedToMy("Knee starter"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: TOAST_UNDO }));
    expect(client.applyUndo).toHaveBeenCalledWith("r1", undo);
  });

  it("remove from detail uses undo", async () => {
    const undo = {
      practitioner_id: "p1",
      routine_id: "r1",
      snapshot: { had_copy: true, copy: null },
    };
    const details = {
      routine_id: "r1",
      body_region_label: "Knee",
      condition_label: null,
      who_its_for: null,
      community: {
        routine_version_id: "rv1",
        version_number: 2,
        name: "Knee starter",
        updated_at: "2026-10-25T12:00:00.000Z",
        created_by: "p1",
        usage_count: 2,
        rows: [],
      },
      my_copy: {
        practitioner_routine_id: "pr1",
        source_version_number: 1,
        edited: false,
        community_updated: false,
        rows: [],
      },
      sent_program_count: 0,
      sent_program_codes: [],
      conditions_available: false,
      personal_changes: {
        baseline_available: true,
        change_count: 0,
        your_change_positions: [],
      },
      community_change_list: null,
    };
    const client = {
      getRoutineDetails: vi.fn().mockResolvedValue(details),
      removeFromMyRoutines: vi.fn().mockResolvedValue({ undo }),
      applyUndo: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as RoutinesClient;

    render(
      <MemoryRouter initialEntries={["/routines/r1"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          routinesClient={client}
        />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove from My routines" }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Remove from My routines" }));
    expect(
      await screen.findByText(toastRemovedFromMy("Knee starter")),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: TOAST_UNDO }));
    expect(client.applyUndo).toHaveBeenCalledWith("r1", undo);
  });

  it("adopt and keep community update from detail banner", async () => {
    const adoptUndo = {
      practitioner_id: "p1",
      routine_id: "r1",
      snapshot: { had_copy: true, copy: null },
    };
    const details = {
      routine_id: "r1",
      body_region_label: "Knee",
      condition_label: null,
      who_its_for: null,
      community: {
        routine_version_id: "rv2",
        version_number: 3,
        name: "Knee starter",
        updated_at: "2026-10-25T12:00:00.000Z",
        created_by: "p2",
        usage_count: 2,
        rows: [],
      },
      my_copy: {
        practitioner_routine_id: "pr1",
        source_version_number: 1,
        edited: false,
        community_updated: true,
        rows: [],
      },
      sent_program_count: 0,
      sent_program_codes: [],
      conditions_available: false,
      personal_changes: {
        baseline_available: true,
        change_count: 1,
        your_change_positions: [0],
      },
      community_change_list: {
        baseline_available: true,
        entries: [
          { version_number: 2, change_summary: "Adjusted dose" },
          { version_number: 3, change_summary: null },
        ],
      },
    };
    const client = {
      getRoutineDetails: vi.fn().mockResolvedValue(details),
      adoptCommunityVersion: vi.fn().mockResolvedValue({
        undo: adoptUndo,
        adopted_version: 3,
      }),
      keepMyCopyVersion: vi.fn().mockResolvedValue({ undo: adoptUndo }),
      applyUndo: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as RoutinesClient;
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/routines/r1"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          routinesClient={client}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
    });
    expect(screen.getByTestId("routine-community-changes")).toBeInTheDocument();
    expect(screen.getByTestId("routine-community-change-v2")).toHaveTextContent(
      "Adjusted dose",
    );
    expect(screen.getByTestId("routine-community-change-v3")).toHaveTextContent("v3");
    expect(screen.getByTestId("routine-community-change-v3").textContent).not.toContain(
      "Adjusted",
    );
    const multilineSummary = screen
      .getByTestId("routine-community-change-v2")
      .querySelector(".rt-update-list-summary");
    expect(multilineSummary).toHaveTextContent("Adjusted dose");
    expect(
      screen.getByRole("button", { name: CREATE_PROGRAM_FROM_ROUTINE }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: useVersionN(3) }));
    expect(await screen.findByText(toastAdoptedVersion(3))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: TOAST_UNDO }));
    expect(client.applyUndo).toHaveBeenCalledWith("r1", adoptUndo);

    await user.click(screen.getByRole("button", { name: KEEP_MINE }));
    expect(await screen.findByText(toastKeptCopy(1))).toBeInTheDocument();
  });

  it("shows empty mutation error slot and no success toast when save fails", async () => {
    const details = {
      routine_id: "r1",
      body_region_label: "Knee",
      condition_label: null,
      who_its_for: null,
      community: {
        routine_version_id: "rv1",
        version_number: 1,
        name: "Knee starter",
        updated_at: "2026-10-25T12:00:00.000Z",
        created_by: "p1",
        usage_count: 0,
        rows: [],
      },
      my_copy: null,
      sent_program_count: 0,
      sent_program_codes: [],
      conditions_available: false,
      personal_changes: null,
      community_change_list: null,
    };
    const client = {
      getRoutineDetails: vi.fn().mockResolvedValue(details),
      saveToMyRoutines: vi.fn().mockRejectedValue(new Error("stale_write")),
    } as unknown as RoutinesClient;
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/routines/r1"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          routinesClient={client}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Knee starter")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Save to My routines" }));
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="routine-detail-mutation-error-slot"]'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(toastSavedToMy("Knee starter"))).not.toBeInTheDocument();
  });

  it("clears mutation error slot on retry then shows it again when adopt fails", async () => {
    const details = {
      routine_id: "r1",
      body_region_label: "Knee",
      condition_label: null,
      who_its_for: null,
      community: {
        routine_version_id: "rv2",
        version_number: 3,
        name: "Knee starter",
        updated_at: "2026-10-25T12:00:00.000Z",
        created_by: "p2",
        usage_count: 2,
        rows: [],
      },
      my_copy: {
        practitioner_routine_id: "pr1",
        source_version_number: 1,
        edited: false,
        community_updated: true,
        rows: [],
      },
      sent_program_count: 0,
      sent_program_codes: [],
      conditions_available: false,
      personal_changes: {
        baseline_available: true,
        change_count: 0,
        your_change_positions: [],
      },
      community_change_list: {
        baseline_available: true,
        entries: [{ version_number: 2, change_summary: "Line one" }],
      },
    };
    const adoptCommunityVersion = vi
      .fn()
      .mockRejectedValueOnce(new Error("stale_write"))
      .mockRejectedValueOnce(new Error("stale_write"));
    const client = {
      getRoutineDetails: vi.fn().mockResolvedValue(details),
      adoptCommunityVersion,
    } as unknown as RoutinesClient;
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/routines/r1"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          routinesClient={client}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: useVersionN(3) }));
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="routine-detail-mutation-error-slot"]'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(toastAdoptedVersion(3))).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: useVersionN(3) }));
    await waitFor(() => expect(adoptCommunityVersion).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="routine-detail-mutation-error-slot"]'),
      ).toBeInTheDocument();
    });
  });
});
