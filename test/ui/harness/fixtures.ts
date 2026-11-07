import type { ExerciseLibraryClient } from "../../../src/ui/api/exercise-library-client.js";
import { DEV_PRACTITIONER_ID } from "../../../src/ui/api/exercise-library-client.js";
import type { ExerciseMediaClient } from "../../../src/ui/api/exercise-media-client.js";
import type { ExerciseRequestsClient } from "../../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../../src/ui/api/programs-client.js";
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

const programsListItem = {
  program_id: "prog-layout-1",
  code: "PRG-2M8D",
  name: "Knee rehab, week 1",
  exercise_count: 2,
  draft_updated_at: "2026-10-24T12:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" as const },
  library_updates_to_review: 0,
  share_link_status: "none" as const,
  last_sent_at: "2026-10-24T12:00:00.000Z",
  deleted_at: null,
  routine_origin: null,
};

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
  | "programs-empty"
  | "programs-no-match"
  | "programs-populated";

export type HarnessFixture = {
  initialEntries: Array<string | { pathname: string; state?: unknown }>;
  library: ExerciseLibraryClient;
  requests: ExerciseRequestsClient;
  media: ExerciseMediaClient;
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
      };
    case "programs-empty":
      return {
        initialEntries: ["/programs"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
      };
    case "programs-no-match":
      return {
        initialEntries: ["/programs?q=ZZZ"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
      };
    case "programs-populated":
      return {
        initialEntries: ["/programs"],
        library: baseLibraryClient(),
        requests: {
          getInProgressCount: async () => ({ in_progress_count: 0 }),
          listInProgress: async () => ({
            requests: [],
            in_progress_count: 0,
          }),
        } as unknown as ExerciseRequestsClient,
        media,
      };
    default: {
      const never: never = id;
      throw new Error(`Unknown fixture ${never}`);
    }
  }
}

export function programsClientForHarness(fixtureId?: HarnessFixtureId): ProgramsClient {
  if (fixtureId === "programs-no-match") {
    return {
      listPrograms: async (q?: string) => {
        if (q?.trim()) {
          return { items: [], matched_code: null };
        }
        return { items: [programsListItem], matched_code: null };
      },
      listDeletedPrograms: async () => ({ items: [] }),
    } as unknown as ProgramsClient;
  }
  if (fixtureId === "programs-populated") {
    return {
      listPrograms: async () => ({ items: [programsListItem], matched_code: null }),
      listDeletedPrograms: async () => ({ items: [] }),
    } as unknown as ProgramsClient;
  }
  return baseProgramsClient();
}
