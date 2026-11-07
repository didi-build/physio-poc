import type { ExerciseLibraryClient } from "../../../src/ui/api/exercise-library-client.js";
import { DEV_PRACTITIONER_ID } from "../../../src/ui/api/exercise-library-client.js";
import type { ExerciseMediaClient } from "../../../src/ui/api/exercise-media-client.js";
import type { ExerciseRequestsClient } from "../../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../../src/ui/api/programs-client.js";
import type { RoutinesClient } from "../../../src/ui/api/routines-client.js";
import type { RequestConflictLocationState } from "../../../src/ui/exercise-requests/RequestConflictPage.js";

const draftView = {
  request_id: "req-layout-1",
  requested_name: "Heel slide",
  exercise_note: null,
  status: "drafting" as const,
  requested_by: DEV_PRACTITIONER_ID,
  requested_by_email: "kojo@example.com",
  exercise_id: "ex-layout-1",
  draft: {
    exercise_version_id: "ver-layout-1",
    version_number: 1,
    title: "Heel slide",
    description: "Desc",
    equipment: "",
    starting_position: "Supine",
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

const approvedStub = {
  exercise_id: "ex-lib-1",
  exercise_version_id: "ver-lib-1",
  exercise_name: "Heel slide (library)",
  category: "Stretching" as const,
  body_regions: ["Lower leg"],
  allowed_prescription_types: ["stretching"],
  matched_alias: null,
  usage_count: 0,
};

export const conflictState: RequestConflictLocationState = {
  pending: { requested_name: "Heel slide", exercise_note: "supine" },
  similar_request: {
    request_id: "req-other",
    requested_name: "Heel slide",
    exercise_note: null,
    requested_by: "other-pract",
    requested_by_email: "other@example.com",
    status: "drafting",
    exercise_id: "ex-d",
    draft_title: "Heel slide",
    submitted_at: "2026-10-30T11:00:00.000Z",
  },
  form_opened_at: "2026-10-30T10:00:00.000Z",
};

function baseLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: async () => ({
      list_state: "ok",
      sections: {
        new_from_requests: [],
        pinned: [],
        recently_used_and_saved: [],
      },
    }),
    searchApproved: async () => ({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    }),
  } as unknown as ExerciseLibraryClient;
}

function baseProgramsClient(): ProgramsClient {
  return {
    listPrograms: async () => ({ items: [], matched_code: null }),
    listDeletedPrograms: async () => ({ items: [] }),
  } as unknown as ProgramsClient;
}

export type HarnessFixtureId =
  | "search-similar"
  | "request-form"
  | "request-submitted"
  | "conflict"
  | "requests-list"
  | "draft-review"
  | "exercises-mine"
  | "routines-all"
  | "routines-all-populated"
  | "routines-my-flag"
  | "routines-detail-update"
  | "routines-conditions-filled"
  | "routines-search-active";

function baseRoutinesClient(): RoutinesClient {
  return {
    searchCommunity: async () => ({
      routines: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
      conditions_available: false,
      condition_options: [],
    }),
    listMyRoutines: async () => ({
      drafts: [],
      saved: [],
      flagged_count: 0,
      conditions_available: false,
      condition_options: [],
    }),
  } as unknown as RoutinesClient;
}

export type HarnessFixture = {
  initialEntries: Array<string | { pathname: string; state?: unknown }>;
  library: ExerciseLibraryClient;
  requests: ExerciseRequestsClient;
  media: ExerciseMediaClient;
  routines: RoutinesClient;
};

export function harnessFixture(
  id: Exclude<HarnessFixtureId, "request-submitted">,
): HarnessFixture {
  const getInProgressCount = async () => ({ in_progress_count: 1 });
  const listInProgress = async () => ({
    in_progress_count: 1,
    requests: [
      {
        request_id: "req-layout-1",
        requested_name: "Heel slide",
        exercise_note: null,
        status: "drafting",
        requested_by: DEV_PRACTITIONER_ID,
        requested_by_email: "kojo@example.com",
        exercise_id: "ex-layout-1",
        draft_title: "Heel slide",
        updated_at: "2026-10-30T12:00:00.000Z",
      },
    ],
  });

  const media: ExerciseMediaClient = {
    getRegenerationQuota: async () => ({
      limit: 5,
      used: 0,
      remaining: 5,
      limitReached: false,
    }),
    regenerateDraftMedia: async () => undefined,
  } as unknown as ExerciseMediaClient;

  switch (id) {
    case "search-similar":
      return {
        initialEntries: ["/exercises/search?q=Heel%20slide"],
        library: {
          ...baseLibraryClient(),
          searchApproved: async () => ({
            exercises: [approvedStub],
            next_cursor: null,
            search_link: null,
            total_count: 1,
          }),
        } as unknown as ExerciseLibraryClient,
        requests: {
          listSimilar: async () => ({
            library_matches: [approvedStub],
            drafts_in_progress: [
              {
                request_id: "req-draft-1",
                requested_name: "Heel slide draft",
                exercise_note: null,
                status: "drafting",
                exercise_id: "ex-d-1",
                draft_title: "Heel slide draft",
                requested_by: DEV_PRACTITIONER_ID,
                requested_by_email: "kojo@example.com",
              },
            ],
          }),
          getInProgressCount,
          listInProgress,
          submitRequest: async () => ({
            outcome: "created",
            request_id: "req-1",
            status: "drafting",
            exercise_id: "ex-1",
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: baseRoutinesClient(),
      };
    case "request-form":
      return {
        initialEntries: ["/exercises/search?q=Unique%20move"],
        library: baseLibraryClient(),
        requests: {
          listSimilar: async () => ({
            library_matches: [],
            drafts_in_progress: [],
          }),
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
          submitRequest: async () => ({
            outcome: "created",
            request_id: "req-1",
            status: "drafting",
            exercise_id: "ex-1",
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: baseRoutinesClient(),
      };
    case "conflict":
      return {
        initialEntries: [{ pathname: "/requests/conflict", state: conflictState }],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount,
          listInProgress,
          submitRequest: async () => ({ outcome: "merged", request_id: "req-other" }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: baseRoutinesClient(),
      };
    case "requests-list":
      return {
        initialEntries: ["/requests"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount,
          listInProgress,
        } as unknown as ExerciseRequestsClient,
        media,
        routines: baseRoutinesClient(),
      };
    case "draft-review":
      return {
        initialEntries: ["/requests/req-layout-1"],
        library: baseLibraryClient(),
        requests: {
          getRequest: async () => draftView,
          updateDraft: async () => draftView,
          approveRequest: async () => ({
            request_id: "req-layout-1",
            exercise_id: "ex-layout-1",
            exercise_version_id: "ver-layout-1",
            version_number: 1 as const,
            approved_by: DEV_PRACTITIONER_ID,
            approved_at: "2026-10-30T12:00:00.000Z",
          }),
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: baseRoutinesClient(),
      };
    case "exercises-mine":
      return {
        initialEntries: ["/exercises"],
        library: {
          ...baseLibraryClient(),
          searchApproved: async () => ({
            exercises: [],
            next_cursor: null,
            search_link: null,
            total_count: 12,
          }),
        } as unknown as ExerciseLibraryClient,
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: baseRoutinesClient(),
      };
    case "routines-all":
      return {
        initialEntries: ["/routines"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: baseRoutinesClient(),
      };
    case "routines-all-populated":
      return {
        initialEntries: ["/routines"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: {
          searchCommunity: async () => ({
            routines: [
              {
                routine_id: "r-knee",
                routine_version_id: "rv-knee-1",
                name: "Knee starter",
                version_number: 2,
                body_region_label: "Knee",
                condition_label: null,
                exercise_count: 4,
                usage_count: 12,
                added_by_you: false,
                in_my_routines: false,
              },
              {
                routine_id: "r-hip",
                routine_version_id: "rv-hip-1",
                name: "Hip mobility",
                version_number: 1,
                body_region_label: "Hip",
                condition_label: null,
                exercise_count: 3,
                usage_count: 5,
                added_by_you: true,
                in_my_routines: true,
              },
            ],
            next_cursor: null,
            search_link: null,
            total_count: 2,
            conditions_available: false,
            condition_options: [],
          }),
          listMyRoutines: async () => ({
            drafts: [],
            saved: [],
            flagged_count: 0,
            conditions_available: false,
            condition_options: [],
          }),
        } as unknown as RoutinesClient,
      };
    case "routines-my-flag":
      return {
        initialEntries: ["/routines?tab=my"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: {
          searchCommunity: async () => ({
            routines: [],
            next_cursor: null,
            search_link: null,
            total_count: 0,
            conditions_available: false,
            condition_options: [],
          }),
          listMyRoutines: async () => ({
            drafts: [
              {
                routine_id: "r-draft",
                name: "Draft knee plan",
                body_region_label: "Knee",
                condition_label: null,
                draft_updated_at: "2026-10-25T12:00:00.000Z",
              },
            ],
            saved: [
              {
                routine_id: "r-saved",
                name: "Knee starter",
                saved_copy_version: 1,
                community_version: 3,
                edited: true,
                saved_at: "2026-10-20T12:00:00.000Z",
                last_used_at: "2026-10-24T12:00:00.000Z",
                community_updated: true,
                body_region_label: "Knee",
                condition_label: null,
                exercise_count: 4,
              },
            ],
            flagged_count: 2,
            conditions_available: false,
            condition_options: [],
          }),
        } as unknown as RoutinesClient,
      };
    case "routines-detail-update":
      return {
        initialEntries: ["/routines/r-saved"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: {
          getRoutineDetails: async () => ({
            routine_id: "r-saved",
            body_region_label: "Knee",
            condition_label: null,
            who_its_for: "Early rehab",
            community: {
              routine_version_id: "rv-knee-3",
              version_number: 3,
              name: "Knee starter",
              updated_at: "2026-10-25T12:00:00.000Z",
              created_by: "p-other",
              usage_count: 12,
              rows: [
                {
                  position: 0,
                  exercise_id: "ex-1",
                  exercise_version_id: "ver-1",
                  exercise_name: "Heel slide",
                  prescription_type: "stretching",
                  params: { hold_s: 30, per_day: { min: 2, max: 3 }, days_per_week: 7 },
                },
              ],
            },
            my_copy: {
              practitioner_routine_id: "pr-1",
              source_version_number: 1,
              edited: true,
              community_updated: true,
              rows: [
                {
                  position: 0,
                  exercise_id: "ex-1",
                  exercise_version_id: "ver-1",
                  exercise_name: "Heel slide",
                  prescription_type: "stretching",
                  params: { hold_s: 30, per_day: { min: 2, max: 3 }, days_per_week: 7 },
                },
              ],
            },
            sent_program_count: 1,
            sent_program_codes: ["AB12CD"],
            conditions_available: false,
            personal_changes: {
              baseline_available: true,
              change_count: 1,
              your_change_positions: [0],
            },
            community_change_list: { status: "held_pending_design" },
          }),
        } as unknown as RoutinesClient,
      };
    case "routines-conditions-filled":
      return {
        initialEntries: ["/routines"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: {
          searchCommunity: async () => ({
            routines: [
              {
                routine_id: "r-arthritis",
                routine_version_id: "rv-arthritis",
                name: "Arthritis knee",
                version_number: 1,
                body_region_label: "Knee",
                condition_label: "Arthritis",
                exercise_count: 3,
                usage_count: 4,
                added_by_you: false,
                in_my_routines: false,
              },
            ],
            next_cursor: null,
            search_link: null,
            total_count: 1,
            conditions_available: true,
            condition_options: [{ condition_id: "c1", label: "Arthritis" }],
          }),
          listMyRoutines: async () => ({
            drafts: [],
            saved: [],
            flagged_count: 0,
            conditions_available: true,
            condition_options: [{ condition_id: "c1", label: "Arthritis" }],
          }),
        } as unknown as RoutinesClient,
      };
    case "routines-search-active":
      return {
        initialEntries: ["/routines?q=knee"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
        routines: {
          searchCommunity: async () => ({
            routines: [
              {
                routine_id: "r-knee",
                routine_version_id: "rv-knee",
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
            next_cursor: null,
            search_link: null,
            total_count: 1,
            conditions_available: false,
            condition_options: [],
          }),
          listMyRoutines: async () => ({
            drafts: [],
            saved: [],
            flagged_count: 0,
            conditions_available: false,
            condition_options: [],
          }),
        } as unknown as RoutinesClient,
      };
    default: {
      const never: never = id;
      throw new Error(`Unknown fixture ${never}`);
    }
  }
}

export function programsClientForHarness(): ProgramsClient {
  return baseProgramsClient();
}
