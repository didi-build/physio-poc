/**
 * @vitest-environment jsdom
 *
 * CTO DIDI-1082 item 1 — behavioural retry: pending "Trying again...", awaited
 * handlers, and refocus after failed retry on each mandated surface.
 */
import "./setup.js";
import { ensureMatchMediaStub } from "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import { PhysioApp } from "../../src/ui/App.js";
import {
  type ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  type ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  type RoutinesClient,
  setRoutinesClientForTests,
} from "../../src/ui/api/routines-client.js";
import {
  ADD_TO_MY,
  REMOVE_FROM_MY,
  SUBMIT_REQUEST,
} from "../../src/ui/copy/exercise-library.js";
import { TRY_AGAIN, TRYING_AGAIN } from "../../src/ui/copy/shared-load-states.js";
import { SAVE_MY_COPY, useVersionN } from "../../src/ui/copy/routines.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";
import type { ProgramShareConnectorView } from "../../src/services/programs/program-publish-service.js";
import { setExerciseMediaClientForTests } from "../../src/ui/api/exercise-media-client.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
  setRoutinesClientForTests(null);
  ensureMatchMediaStub();
});

function stubLibraryClient(
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

function stubRequestsClient(
  overrides: Partial<ExerciseRequestsClient> = {},
): ExerciseRequestsClient {
  return {
    getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
    listSimilar: vi.fn().mockResolvedValue({
      library_matches: [],
      drafts_in_progress: [],
    }),
    listInProgress: vi.fn().mockResolvedValue({ requests: [], in_progress_count: 0 }),
    ...overrides,
  } as unknown as ExerciseRequestsClient;
}

function renderPhysio(
  initialEntry: string,
  extras: {
    exerciseLibraryClient?: ExerciseLibraryClient;
    exerciseRequestsClient?: ExerciseRequestsClient;
    programsClient?: ProgramsClient;
    routinesClient?: RoutinesClient;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhysioApp
        exerciseLibraryClient={extras.exerciseLibraryClient ?? stubLibraryClient()}
        exerciseRequestsClient={extras.exerciseRequestsClient ?? stubRequestsClient()}
        programsClient={extras.programsClient}
        routinesClient={extras.routinesClient}
      />
    </MemoryRouter>,
  );
}

const exerciseDetailView = {
  exercise_id: "ex-1",
  category: "Stretching" as const,
  body_regions: ["knee"],
  aliases: [],
  version_number: 1,
  in_my_exercises: false,
  favourite: false,
  library: {
    title: "Heel slide",
    description: "Desc",
    steps: "[]",
    equipment: null,
    precautions: null,
    cue_stretching: null,
    cue_isometric: null,
    cue_concentric: null,
    cue_eccentric: null,
  },
  resolved_text: [
    { key: "title", resolved: "Heel slide", library_value: "Heel slide" },
    { key: "description", resolved: "Desc", library_value: "Desc" },
  ],
};

const myCopyExerciseView = {
  ...exerciseDetailView,
  in_my_exercises: true,
};

function builderProgram(): ProgramBuilderView {
  return {
    program_id: "prog-1",
    code: "PRG-TEST",
    name: "Knee program A",
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: {
      kind: "published",
      published_at: "2026-10-20T12:00:00.000Z",
    },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: 1,
    library_updates_to_review: 0,
    rows: [],
    open_share_link: true,
    share_link_status: "open",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
  };
}

function openShareView(): ProgramShareConnectorView {
  return {
    display_state: "published_only",
    share_link: "https://physio.test.example/l/open",
    share_link_status: "open",
    share_link_state: "live",
    expires_at: "2027-10-24T12:00:00.000Z",
    open_share_link: true,
    draft: null,
    published: { version: 1, updated_at: "2026-10-20T12:00:00.000Z" },
    program_code: "PRG-TEST",
    program_name: "Knee program A",
    link_expires_in: "1_year",
    link_expires_on: null,
    practitioner_default_expires_in: "1_year",
    publish_change_lines: [],
    published_at: "2026-10-20T12:00:00.000Z",
  };
}

async function expectTryingAgainWhileAlertMounted(alertTestId: string) {
  await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
  expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
  expect(screen.getByTestId(alertTestId)).toBeInTheDocument();
}

async function expectRefocusOnFailedSaveAlert(
  alertTestId: string,
  endHang: () => void,
) {
  endHang();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
  });
  expect(document.activeElement).toBe(screen.getByTestId(alertTestId));
}

describe("CTO item 1 retry behaviour", () => {
  it("keeps ProgramShare initial load error banner mounted with Trying again during retry and refocuses Try again on failure (CTO item 1)", async () => {
    let rejectHang!: (error: Error) => void;
    const getProgramByCode = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<ProgramBuilderView>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        availability: "open",
        program_name: "Knee program A",
        published_at: "2026-10-20T12:00:00.000Z",
        rows: [],
      }),
    }) as typeof fetch;

    renderPhysio(
      fillPhysioAppRoutePattern("programShare", { programCode: "PRG-TEST" }),
      {
        programsClient: {
          getProgramByCode,
          getShareLink: vi.fn(),
        } as unknown as ProgramsClient,
      },
    );

    const slot = await screen.findByTestId("programs-builder-error-slot");
    await waitFor(() => {
      expect(within(slot).getByRole("button", { name: TRY_AGAIN })).toBeInTheDocument();
    });
    await userEvent.click(within(slot).getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    expect(screen.getByTestId("programs-builder-error-slot")).toBeInTheDocument();
    rejectHang(new Error("fail again"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: TRY_AGAIN }),
    );
    expect(getProgramByCode).toHaveBeenCalledTimes(2);
  });

  it("keeps ProgramShare link expiry failed-save alert mounted with Trying again during retry and refocuses alert on failure (CTO item 1)", async () => {
    let rejectHang!: (error: Error) => void;
    const setShareLinkExpiry = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        availability: "open",
        program_name: "Knee program A",
        published_at: "2026-10-20T12:00:00.000Z",
        rows: [],
      }),
    }) as typeof fetch;

    renderPhysio(
      fillPhysioAppRoutePattern("programShare", { programCode: "PRG-TEST" }),
      {
        programsClient: {
          getProgramByCode: vi.fn().mockResolvedValue(builderProgram()),
          getShareLink: vi.fn().mockResolvedValue(openShareView()),
          setShareLinkExpiry,
        } as unknown as ProgramsClient,
      },
    );

    await screen.findByRole("button", { name: /30 days/ });
    await userEvent.click(screen.getByRole("button", { name: /30 days/ }));
    await waitFor(() => {
      expect(
        screen.getByTestId("program-link-expiry-failed-save-alert"),
      ).toBeInTheDocument();
    });
    await expectTryingAgainWhileAlertMounted("program-link-expiry-failed-save-alert");
    await expectRefocusOnFailedSaveAlert(
      "program-link-expiry-failed-save-alert",
      () => {
        rejectHang(new Error("fail again"));
      },
    );
    expect(setShareLinkExpiry).toHaveBeenCalledTimes(2);
  });

  it("keeps exercise detail save failed-save alert mounted with Trying again during retry and refocuses alert on failure (CTO item 1)", async () => {
    let rejectHang!: (error: Error) => void;
    const saveToMyExercises = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );

    renderPhysio(fillPhysioAppRoutePattern("exerciseDetail", { exerciseId: "ex-1" }), {
      exerciseLibraryClient: stubLibraryClient({
        getExerciseDetails: vi.fn().mockResolvedValue(exerciseDetailView),
        saveToMyExercises,
      }),
    });

    await screen.findByRole("button", { name: ADD_TO_MY });
    await userEvent.click(screen.getByRole("button", { name: ADD_TO_MY }));
    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-detail-save-failed-save-alert"),
      ).toBeInTheDocument();
    });
    await expectTryingAgainWhileAlertMounted("exercise-detail-save-failed-save-alert");
    await expectRefocusOnFailedSaveAlert(
      "exercise-detail-save-failed-save-alert",
      () => {
        rejectHang(new Error("fail again"));
      },
    );
    expect(saveToMyExercises).toHaveBeenCalledTimes(2);
  });

  it("keeps RoutineDetails adopt-version failed-save alert mounted with Trying again during retry and refocuses alert on failure (CTO item 1)", async () => {
    let rejectHang!: (error: Error) => void;
    const adoptCommunityVersion = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );
    const details = {
      routine_id: "r1",
      body_region_id: "br-knee",
      body_region_label: "Knee",
      condition_id: null,
      condition_label: null,
      who_its_for: null,
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
        entries: [{ version_number: 2, change_summary: "Adjusted dose" }],
      },
      is_draft: false,
      draft: null,
      community: {
        routine_version_id: "rv2",
        version_number: 2,
        name: "Knee starter",
        updated_at: "2026-10-25T12:00:00.000Z",
        created_by: "dev",
        usage_count: 0,
        rows: [],
      },
      my_copy: {
        practitioner_routine_id: "pr-1",
        source_version_number: 1,
        edited: false,
        community_updated: true,
        rows: [],
      },
    };

    renderPhysio(fillPhysioAppRoutePattern("routineDetail", { routineId: "r1" }), {
      routinesClient: {
        getRoutineDetails: vi.fn().mockResolvedValue(details),
        adoptCommunityVersion,
      } as unknown as RoutinesClient,
    });

    await waitFor(() => {
      expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: useVersionN(2) }));
    await waitFor(() => {
      expect(
        screen.getByTestId("routine-adopt-version-failed-save-alert"),
      ).toBeInTheDocument();
    });
    await expectTryingAgainWhileAlertMounted("routine-adopt-version-failed-save-alert");
    await expectRefocusOnFailedSaveAlert(
      "routine-adopt-version-failed-save-alert",
      () => {
        rejectHang(new Error("fail again"));
      },
    );
    expect(adoptCommunityVersion).toHaveBeenCalledTimes(2);
  });

  it("keeps RoutineMyCopyEditor save failed-save alert mounted with Trying again during retry and refocuses alert on failure (CTO item 1)", async () => {
    let rejectHang!: (error: Error) => void;
    const updateMyCopy = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );
    const routineDetails = {
      routine_id: "rt-1",
      body_region_label: "Knee",
      condition_label: null,
      who_its_for: null,
      community: {
        routine_version_id: "rv-1",
        version_number: 1,
        name: "Knee starter",
        updated_at: "2026-10-25T12:00:00.000Z",
        created_by: "dev-practitioner",
        usage_count: 0,
        rows: [
          {
            position: 0,
            exercise_id: "ex-1",
            exercise_version_id: "ver-1",
            exercise_name: "Heel slide",
            prescription_type: "stretching",
            params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      },
      my_copy: {
        practitioner_routine_id: "pr-1",
        source_version_number: 1,
        edited: false,
        community_updated: false,
        rows: [
          {
            position: 0,
            exercise_id: "ex-1",
            exercise_version_id: "ver-1",
            exercise_name: "Heel slide",
            prescription_type: "stretching",
            params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
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

    renderPhysio(fillPhysioAppRoutePattern("routineMyCopy", { routineId: "rt-1" }), {
      routinesClient: {
        getRoutineDetails: vi.fn().mockResolvedValue(routineDetails),
        updateMyCopy,
      } as unknown as RoutinesClient,
    });

    const hold = await screen.findByTestId("rt-hold-0");
    await userEvent.clear(hold);
    await userEvent.type(hold, "45");
    await userEvent.click(screen.getByRole("button", { name: SAVE_MY_COPY }));
    await waitFor(() => {
      expect(
        screen.getByTestId("routine-my-copy-mutation-error-slot"),
      ).toBeInTheDocument();
    });
    await expectTryingAgainWhileAlertMounted("routine-my-copy-mutation-error-slot");
    await expectRefocusOnFailedSaveAlert("routine-my-copy-mutation-error-slot", () => {
      rejectHang(new Error("fail again"));
    });
    expect(updateMyCopy).toHaveBeenCalledTimes(2);
  });

  it("keeps exercise MyCopyEditor remove failed-save alert mounted with Trying again during retry and refocuses alert on failure (CTO item 1)", async () => {
    let rejectHang!: (error: Error) => void;
    const removeFromMyExercises = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );

    renderPhysio(fillPhysioAppRoutePattern("exerciseMyCopy", { exerciseId: "ex-1" }), {
      exerciseLibraryClient: stubLibraryClient({
        getExerciseDetails: vi.fn().mockResolvedValue(myCopyExerciseView),
        removeFromMyExercises,
        updateMyCopy: vi.fn(),
      }),
    });

    await screen.findByRole("button", { name: REMOVE_FROM_MY });
    await userEvent.click(screen.getByRole("button", { name: REMOVE_FROM_MY }));
    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-mycopy-failed-save-alert"),
      ).toBeInTheDocument();
    });
    await expectTryingAgainWhileAlertMounted("exercise-mycopy-failed-save-alert");
    await expectRefocusOnFailedSaveAlert("exercise-mycopy-failed-save-alert", () => {
      rejectHang(new Error("fail again"));
    });
    expect(removeFromMyExercises).toHaveBeenCalledTimes(2);
  });

  it("keeps exercise library submit failed-save alert mounted with Trying again during retry and refocuses alert on failure (CTO item 1)", async () => {
    let rejectHang!: (error: Error) => void;
    const submitRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );

    renderPhysio(`${fillPhysioAppRoutePattern("exerciseSearch")}?q=UniqueName`, {
      exerciseLibraryClient: stubLibraryClient(),
      exerciseRequestsClient: stubRequestsClient({ submitRequest }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("exercise-request-card")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: SUBMIT_REQUEST }));
    await waitFor(() => {
      expect(
        screen.getByTestId("request-submit-failed-save-alert"),
      ).toBeInTheDocument();
    });
    await expectTryingAgainWhileAlertMounted("request-submit-failed-save-alert");
    await expectRefocusOnFailedSaveAlert("request-submit-failed-save-alert", () => {
      rejectHang(new Error("fail again"));
    });
    expect(submitRequest).toHaveBeenCalledTimes(2);
  });
});
