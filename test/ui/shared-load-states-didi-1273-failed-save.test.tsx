/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { ensureMatchMediaStub } from "./setup.js";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseMediaClient,
  setExerciseMediaClientForTests,
} from "../../src/ui/api/exercise-media-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  ProgramsApiError,
  type ProgramsClient,
} from "../../src/ui/api/programs-client.js";
import {
  RoutinesClient,
  setRoutinesClientForTests,
} from "../../src/ui/api/routines-client.js";
import type { MyDefaultsClient } from "../../src/ui/api/my-defaults-client.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../src/domain/global-type-defaults-seed.js";
import { PRESCRIPTION_TYPES } from "../../src/domain/exercise-types.js";
import { SHARE_LINK_EXPIRES_IN } from "../../src/mcp-connector/share-link-expiry.js";
import {
  DESCRIPTION_FIELD,
  SUBMIT_REQUEST,
} from "../../src/ui/copy/exercise-library.js";
import { didi1273FailedSaveMessage } from "../../src/ui/shared-load-states/failed-save.js";
import {
  APPROVE,
  MERGE_MY_CHANGES,
  REGENERATE,
  REGENERATE_IMAGES,
} from "../../src/ui/copy/exercise-requests.js";
import {
  editYourTypeDefaultLabel,
  SAVE,
  TYPE_LABELS,
} from "../../src/ui/copy/my-defaults.js";
import { PUBLISH_NOW } from "../../src/ui/copy/program-publish.js";
import {
  AUTO_SAVE_FAILURE_HELPER,
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_TRY_AGAIN_ARIA,
  removeRowAriaLabel,
} from "../../src/ui/copy/programs.js";
import { FAILED_SAVE_DRAFT } from "../../src/ui/copy/shared-load-states.js";
import {
  PUBLISH_NOW as ROUTINE_PUBLISH_NOW,
  RESTORE_THIS_VERSION,
  ROUTINE_NAME_LABEL,
  useVersionN,
} from "../../src/ui/copy/routines.js";
import { RESTORE } from "../../src/ui/copy/programs.js";
import type {
  ProgramBuilderRow,
  ProgramBuilderView,
  ProgramListItem,
} from "../../src/services/programs/types.js";
import type {
  RoutineDetailsDraft,
  RoutineExerciseRow,
} from "../../src/services/routines/types.js";
import type { ProgramShareConnectorView } from "../../src/services/programs/program-publish-service.js";
import { FAKE_UI_PRACTITIONER_ID } from "./fake-practitioner-session-fixture.js";
import { conflictState } from "./harness/fixtures.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
  setRoutinesClientForTests(null);
  vi.useRealTimers();
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
    exerciseMediaClient?: ExerciseMediaClient;
    programsClient?: ProgramsClient;
    routinesClient?: RoutinesClient;
    myDefaultsClient?: MyDefaultsClient;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhysioApp
        exerciseLibraryClient={extras.exerciseLibraryClient ?? stubLibraryClient()}
        exerciseRequestsClient={extras.exerciseRequestsClient ?? stubRequestsClient()}
        exerciseMediaClient={extras.exerciseMediaClient}
        programsClient={extras.programsClient}
        routinesClient={extras.routinesClient}
        myDefaultsClient={extras.myDefaultsClient}
      />
    </MemoryRouter>,
  );
}

const draftReviewView = {
  request_id: "req-1",
  requested_name: "Heel slide",
  exercise_note: null,
  status: "drafting" as const,
  requested_by: FAKE_UI_PRACTITIONER_ID,
  requested_by_email: "kojo@example.com",
  exercise_id: "ex-1",
  draft: {
    exercise_version_id: "ver-1",
    version_number: 1,
    title: "Heel slide",
    description: "Desc",
    equipment: "",
    starting_position: "",
    steps: "",
    common_mistakes: "",
    regressions: "",
    progressions: "",
    precautions: "",
    cue_stretching: null,
    cue_isometric: null,
    cue_concentric: null,
    cue_eccentric: null,
  },
};

const rowReady: RoutineExerciseRow = {
  position: 0,
  exercise_id: "ex-1",
  exercise_version_id: "ver-1",
  exercise_name: "Heel slide",
  prescription_type: "stretching",
  params: { hold_s: 30 },
  lacks_start_or_end_image: false,
};

function routineDraftDetails(
  rows: RoutineExerciseRow[] = [rowReady],
): RoutineDetailsDraft {
  return {
    routine_id: "routine-draft-1",
    body_region_id: "br-knee",
    body_region_label: "Knee",
    condition_id: null,
    condition_label: null,
    who_its_for: null,
    sent_program_count: 0,
    sent_program_codes: [],
    conditions_available: false,
    is_draft: true,
    draft: {
      routine_version_id: "rv-1",
      name: "Knee draft",
      draft_updated_at: "2026-01-01T00:00:00.000Z",
      rows,
    },
    community: null,
    my_copy: null,
    personal_changes: null,
    community_change_list: null,
  };
}

function exerciseRow(id: string, title: string, position = 0): ProgramBuilderRow {
  const params = { reps: 10, hold_s: 2, sets: 3, days_per_week: 3 };
  return {
    id,
    position,
    kind: "exercise",
    exercise_id: "ex-1",
    exercise_version_id: "v1",
    exercise_request_id: null,
    pinned_version_number: 1,
    prescription_type: "concentric",
    params,
    params_source: "global_defaults",
    resolved_params: params,
    resolved_params_source: "global_defaults",
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [{ exercise_version_id: "v1", version_number: 1 }],
  };
}

function builderView(overrides: Partial<ProgramBuilderView> = {}): ProgramBuilderView {
  return {
    program_id: "prog-1",
    code: "PRG-TEST",
    name: "Knee program A",
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: 1,
    library_updates_to_review: 0,
    rows: [exerciseRow("row-a", "Alpha move")],
    open_share_link: false,
    share_link_status: "none",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
    ...overrides,
  };
}

function programsStubs(overrides: Partial<ProgramsClient> = {}): ProgramsClient {
  const listItem: ProgramListItem = {
    program_id: "prog-1",
    code: "PRG-TEST",
    name: "Knee program A",
    exercise_count: 1,
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    library_updates_to_review: 0,
    share_link_status: "none",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
  };
  const program = builderView();
  const shareView: ProgramShareConnectorView = {
    display_state: "draft_only",
    share_link: "",
    share_link_status: "none",
    share_link_state: "none",
    expires_at: null,
    open_share_link: false,
    draft: { version: 1, updated_at: "2026-10-24T12:00:00.000Z" },
    published: null,
    program_code: "PRG-TEST",
    program_name: "Knee program A",
    link_expires_in: null,
    link_expires_on: null,
    practitioner_default_expires_in: "1_year",
    publish_change_lines: [],
    published_at: null,
  };
  const base: Partial<ProgramsClient> = {
    listPrograms: vi.fn().mockResolvedValue({
      items: [listItem],
      matched_code: "PRG-TEST",
    }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    getProgram: vi.fn().mockResolvedValue(program),
    getProgramByCode: vi.fn().mockResolvedValue(program),
    getShareLink: vi.fn().mockResolvedValue(shareView),
    updateProgramName: vi.fn().mockImplementation(async (_id, name) => ({
      program: builderView({ name }),
    })),
    publishProgram: vi.fn(),
    restoreProgram: vi.fn(),
    deleteRow: vi.fn(),
    setShareLinkExpiry: vi.fn(),
  };
  const merged = { ...base, ...overrides } as ProgramsClient;
  if (overrides.getProgram && !overrides.getProgramByCode) {
    merged.getProgramByCode =
      overrides.getProgram as ProgramsClient["getProgramByCode"];
  }
  return merged;
}

function assertFailedSaveAlert(testId: string, message: string) {
  const alert = screen.getByTestId(testId);
  expect(within(alert).getByText(message)).toBeInTheDocument();
}

function stubMyDefaultsClient(
  overrides: Partial<MyDefaultsClient> = {},
): MyDefaultsClient {
  return {
    getPage: vi.fn().mockResolvedValue({
      share_link_expiry: {
        global: { expiresIn: SHARE_LINK_EXPIRES_IN.one_year, customExpiresOn: null },
        practitioner: null,
        effective: { expiresIn: SHARE_LINK_EXPIRES_IN.one_year, customExpiresOn: null },
      },
      exercise_types: PRESCRIPTION_TYPES.map((type) => ({
        type,
        global_params: GLOBAL_TYPE_DEFAULTS_SEED[type],
        practitioner_params:
          type === "stretching" ? { hold_s: 30, per_day: 2, days_per_week: 3 } : null,
      })),
    }),
    updateShareLinkExpiry: vi.fn(),
    upsertTypeDefault: vi.fn(),
    resetTypeDefault: vi.fn(),
    ...overrides,
  } as unknown as MyDefaultsClient;
}

describe("DIDI-1273 failed-save alerts (integration, jsdom)", () => {
  it("shows regenerate media failed-save copy on draft review after confirm", async () => {
    renderPhysio(fillPhysioAppRoutePattern("requestReview", { requestId: "req-1" }), {
      exerciseRequestsClient: stubRequestsClient({
        getRequest: vi.fn().mockResolvedValue(draftReviewView),
      }),
      exerciseMediaClient: {
        getRegenerationQuota: vi.fn().mockResolvedValue({
          limit: 5,
          used: 0,
          remaining: 5,
          limitReached: false,
        }),
        regenerateDraftMedia: vi.fn().mockRejectedValue(new Error("fail")),
      } as unknown as ExerciseMediaClient,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: REGENERATE })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: REGENERATE }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: REGENERATE_IMAGES }),
    );

    await waitFor(() => {
      assertFailedSaveAlert(
        "request-regenerate-media-failed-save-alert",
        "Couldn't regenerate the images. Try again.",
      );
    });
  });

  it("pins exercise restore version failed-save copy (no restore surface yet)", () => {
    expect(didi1273FailedSaveMessage("exercise_restore_version")).toBe(
      "Couldn't restore this version. Try again.",
    );
  });

  it("shows merge exercises failed-save copy on the request conflict page", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: fillPhysioAppRoutePattern("requestConflict"),
            state: conflictState,
          },
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient({
            submitRequest: vi.fn().mockRejectedValue(new Error("fail")),
          })}
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("button", { name: MERGE_MY_CHANGES }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "request-submit-failed-save-alert",
        "Couldn't submit the request. Try again.",
      );
    });
  });

  it("shows routine draft autosave failed-save copy on the draft editor", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const details = {
      ...routineDraftDetails(),
      condition_options: [],
    };
    const autosaveRoutineDraft = vi.fn().mockRejectedValue(new Error("fail"));
    renderPhysio(
      fillPhysioAppRoutePattern("routineDraftEdit", { routineId: "routine-draft-1" }),
      {
        routinesClient: {
          getRoutineDetails: vi.fn().mockResolvedValue(details),
          autosaveRoutineDraft,
          listMyRoutines: vi.fn().mockResolvedValue({
            drafts: [],
            saved: [],
            flagged_count: 0,
            conditions_available: false,
            condition_options: [],
          }),
          listMeBodyRegions: vi.fn().mockResolvedValue([
            {
              body_region_id: "br-knee",
              label: "Knee",
              allowed_prescription_types: [],
            },
          ]),
        } as unknown as RoutinesClient,
      },
    );

    const nameInput = await screen.findByLabelText(ROUTINE_NAME_LABEL);
    await userEvent.type(nameInput, "X");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await waitFor(() => {
      assertFailedSaveAlert(
        "routines-draft-autosave-failed-save-alert",
        FAILED_SAVE_DRAFT,
      );
    });
    expect(FAILED_SAVE_DRAFT).toBe("Couldn't save the draft. Try again.");
    expect(screen.getByText(AUTO_SAVE_NOT_SAVED)).toBeInTheDocument();
    expect(screen.getByText(AUTO_SAVE_FAILURE_HELPER)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN_ARIA }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("rt-draft-publish")).toBeDisabled();
  });

  it("shows routine publish failed-save copy on draft routine detail", async () => {
    renderPhysio(
      fillPhysioAppRoutePattern("routineDetail", { routineId: "routine-draft-1" }),
      {
        routinesClient: {
          getRoutineDetails: vi.fn().mockResolvedValue(routineDraftDetails()),
          publishRoutineDraft: vi.fn().mockRejectedValue(new Error("fail")),
          autosaveRoutineDraft: vi.fn().mockResolvedValue({ ok: true }),
        } as unknown as RoutinesClient,
      },
    );

    await waitFor(() => {
      expect(screen.getByTestId("rt-draft-detail-publish")).toBeEnabled();
    });
    await userEvent.click(screen.getByTestId("rt-draft-detail-publish"));
    await userEvent.click(screen.getByRole("button", { name: ROUTINE_PUBLISH_NOW }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "routine-draft-publish-failed-save-alert",
        "Couldn't publish the routine. Try again.",
      );
    });
  });

  it("shows routine discard draft failed-save copy on draft routine detail", async () => {
    renderPhysio(
      fillPhysioAppRoutePattern("routineDetail", { routineId: "routine-draft-1" }),
      {
        routinesClient: {
          getRoutineDetails: vi.fn().mockResolvedValue(routineDraftDetails()),
          discardRoutineDraft: vi.fn().mockRejectedValue(new Error("fail")),
        } as unknown as RoutinesClient,
      },
    );

    await userEvent.click(await screen.findByTestId("rt-discard-draft"));

    await waitFor(() => {
      assertFailedSaveAlert(
        "routine-draft-discard-failed-save-alert",
        "Couldn't discard the draft. Try again.",
      );
    });
  });

  it("shows routine adopt version failed-save copy on saved routine detail", async () => {
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
        entries: [{ version_number: 2, change_summary: "Adjusted dose" }],
      },
      is_draft: false,
      draft: null,
    };
    renderPhysio(fillPhysioAppRoutePattern("routineDetail", { routineId: "r1" }), {
      routinesClient: {
        getRoutineDetails: vi.fn().mockResolvedValue(details),
        adoptCommunityVersion: vi.fn().mockRejectedValue(new Error("fail")),
      } as unknown as RoutinesClient,
    });

    await waitFor(() => {
      expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: useVersionN(3) }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "routine-adopt-version-failed-save-alert",
        "Couldn't switch to this version. Try again.",
      );
    });
  });

  it("shows routine restore version failed-save copy on version history", async () => {
    renderPhysio(
      fillPhysioAppRoutePattern("routineVersionHistory", { routineId: "r1" }),
      {
        routinesClient: {
          getRoutineVersionHistory: vi.fn().mockResolvedValue({
            live_version_number: 2,
            versions: [
              {
                routine_version_id: "rv1",
                version_number: 1,
                name: "Knee starter",
                is_live: false,
                change_summary: null,
                restored_from_version_number: null,
                sent_program_count: 0,
              },
              {
                routine_version_id: "rv2",
                version_number: 2,
                name: "Knee starter",
                is_live: true,
                change_summary: null,
                restored_from_version_number: null,
                sent_program_count: 0,
              },
            ],
          }),
          restoreRoutineVersion: vi.fn().mockRejectedValue(new Error("fail")),
        } as unknown as RoutinesClient,
      },
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: RESTORE_THIS_VERSION }),
      ).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("rt-restore-v1"));
    await userEvent.click(screen.getByTestId("rt-restore-confirm"));

    await waitFor(() => {
      assertFailedSaveAlert(
        "routine-restore-version-failed-save-alert",
        "Couldn't restore this version. Try again.",
      );
    });
  });

  it("shows program builder autosave failed-save copy after name edit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPhysio("/programs/PRG-TEST", {
      programsClient: programsStubs({
        updateProgramName: vi.fn().mockRejectedValue(new Error("fail")),
      }),
    });

    const nameField = await screen.findByRole("textbox", { name: "Program name" });
    await userEvent.type(nameField, "!");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    await waitFor(() => {
      assertFailedSaveAlert(
        "programs-autosave-failed-save-alert",
        "Couldn't save the program. Try again.",
      );
    });
  });

  it("shows program publish failed-save copy in the publish sheet", async () => {
    renderPhysio(
      fillPhysioAppRoutePattern("programPublish", { programCode: "PRG-TEST" }),
      {
        programsClient: programsStubs({
          publishProgram: vi
            .fn()
            .mockRejectedValue(new ProgramsApiError("request_failed", "fail")),
        }),
      },
    );

    await userEvent.click(await screen.findByRole("button", { name: PUBLISH_NOW }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "program-publish-failed-save-alert",
        "Couldn't publish the program. Try again.",
      );
    });
  });

  it("shows program restore failed-save copy on the programs list", async () => {
    const deleted = {
      program_id: "p-del",
      code: "PRG-DEL",
      name: "Deleted program",
      exercise_count: 0,
      draft_updated_at: "2026-10-24T12:00:00.000Z",
      auto_save_status: { kind: "not_published_yet" as const },
      library_updates_to_review: 0,
      share_link_status: "none" as const,
      last_sent_at: null,
      deleted_at: "2026-10-24T12:00:00.000Z",
      routine_origin: null,
    };
    renderPhysio("/programs", {
      programsClient: programsStubs({
        listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
        listDeletedPrograms: vi.fn().mockResolvedValue({ items: [deleted] }),
        restoreProgram: vi.fn().mockRejectedValue(new Error("fail")),
      }),
    });

    await userEvent.click(await screen.findByRole("button", { name: RESTORE }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "program-restore-failed-save-alert",
        "Couldn't restore the program. Try again.",
      );
    });
  });

  it("shows remove exercise row failed-save copy on the program builder", async () => {
    renderPhysio("/programs/PRG-TEST", {
      programsClient: programsStubs({
        deleteRow: vi.fn().mockRejectedValue(new Error("fail")),
      }),
    });

    await userEvent.click(
      await screen.findByRole("button", {
        name: removeRowAriaLabel("Alpha move"),
      }),
    );

    await waitFor(() => {
      assertFailedSaveAlert(
        "programs-autosave-failed-save-alert",
        "Couldn't remove the exercise. Try again.",
      );
    });
  });

  it("shows link expiry failed-save copy on program share", async () => {
    const program = builderView({
      open_share_link: true,
      share_link_status: "open",
      auto_save_status: { kind: "published", published_at: "2026-10-20T12:00:00.000Z" },
    });
    const shareView: ProgramShareConnectorView = {
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
        programsClient: programsStubs({
          getProgramByCode: vi.fn().mockResolvedValue(program),
          getShareLink: vi.fn().mockResolvedValue(shareView),
          setShareLinkExpiry: vi.fn().mockRejectedValue(new Error("fail")),
        }),
      },
    );

    await screen.findByRole("button", { name: /30 days/ });
    await userEvent.click(screen.getByRole("button", { name: /30 days/ }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "program-link-expiry-failed-save-alert",
        "Couldn't save the link expiry. Try again.",
      );
    });
  });

  it("shows submit request failed-save copy on exercise library search", async () => {
    renderPhysio(`${fillPhysioAppRoutePattern("exerciseSearch")}?q=UniqueName`, {
      exerciseLibraryClient: stubLibraryClient(),
      exerciseRequestsClient: stubRequestsClient({
        submitRequest: vi.fn().mockRejectedValue(new Error("fail")),
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("exercise-request-card")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: SUBMIT_REQUEST }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "request-submit-failed-save-alert",
        "Couldn't submit the request. Try again.",
      );
    });
  });

  it("shows draft review edits failed-save copy when saving a field", async () => {
    renderPhysio(fillPhysioAppRoutePattern("requestReview", { requestId: "req-1" }), {
      exerciseRequestsClient: stubRequestsClient({
        getRequest: vi.fn().mockResolvedValue(draftReviewView),
        updateDraft: vi.fn().mockRejectedValue(new Error("fail")),
      }),
      exerciseMediaClient: {
        getRegenerationQuota: vi.fn().mockResolvedValue({
          limit: 5,
          used: 0,
          remaining: 5,
          limitReached: false,
        }),
      } as unknown as ExerciseMediaClient,
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: `Edit ${DESCRIPTION_FIELD}` }),
      ).toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByRole("button", { name: `Edit ${DESCRIPTION_FIELD}` }),
    );
    const textarea = screen.getByLabelText(DESCRIPTION_FIELD);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "request-draft-edits-failed-save-alert",
        "Couldn't save your edits. Try again.",
      );
    });
  });

  it("shows approve draft failed-save copy on draft review", async () => {
    renderPhysio(fillPhysioAppRoutePattern("requestReview", { requestId: "req-1" }), {
      exerciseRequestsClient: stubRequestsClient({
        getRequest: vi.fn().mockResolvedValue(draftReviewView),
        approveRequest: vi.fn().mockRejectedValue(new Error("fail")),
      }),
      exerciseMediaClient: {
        getRegenerationQuota: vi.fn().mockResolvedValue({
          limit: 5,
          used: 0,
          remaining: 5,
          limitReached: false,
        }),
      } as unknown as ExerciseMediaClient,
    });

    await userEvent.click(await screen.findByRole("button", { name: APPROVE }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "request-approve-failed-save-alert",
        "Couldn't approve the draft. Try again.",
      );
    });
  });

  it("pins request discard draft failed-save copy (no discard surface yet)", () => {
    expect(didi1273FailedSaveMessage("request_discard_draft")).toBe(
      "Couldn't discard the draft. Try again.",
    );
  });

  it("shows defaults share link failed-save copy on My defaults", async () => {
    renderPhysio("/defaults", {
      myDefaultsClient: stubMyDefaultsClient({
        updateShareLinkExpiry: vi.fn().mockRejectedValue(new Error("fail")),
      }),
    });

    await userEvent.click(await screen.findByRole("button", { name: "1 week" }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "defaults-share-link-failed-save-alert",
        "Couldn't save your default. Try again.",
      );
    });
  });

  it("shows defaults exercise type row failed-save copy on My defaults", async () => {
    renderPhysio("/defaults", {
      myDefaultsClient: stubMyDefaultsClient({
        upsertTypeDefault: vi.fn().mockRejectedValue(new Error("fail")),
      }),
    });

    const card = await screen.findByTestId("type-default-stretching");
    await userEvent.click(
      within(card).getByRole("button", {
        name: editYourTypeDefaultLabel(TYPE_LABELS.stretching),
      }),
    );
    const holdInput = within(card).getByRole("textbox", { name: "Hold in seconds" });
    await userEvent.clear(holdInput);
    await userEvent.type(holdInput, "50");
    await userEvent.click(within(card).getByRole("button", { name: SAVE }));

    await waitFor(() => {
      assertFailedSaveAlert(
        "defaults-exercise-type-failed-save-alert",
        "Couldn't save your default. Try again.",
      );
    });
  });
});
