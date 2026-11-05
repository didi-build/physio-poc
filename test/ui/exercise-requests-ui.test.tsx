/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fillPhysioAppRoutePattern,
  physioAppExerciseSearchPath,
} from "../../src/app-routes.js";
import { DEV_PRACTITIONER_ID } from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  ExerciseMediaClient,
  setExerciseMediaClientForTests,
} from "../../src/ui/api/exercise-media-client.js";
import { PhysioApp } from "../../src/ui/App.js";
import {
  DESCRIPTION_FIELD,
  SUBMIT_REQUEST,
} from "../../src/ui/copy/exercise-library.js";
import {
  APPROVE,
  CONFLICT_HEADING,
  MERGE_MY_CHANGES,
  REQUESTS_HEADING,
  TOAST_APPROVE_OWN,
} from "../../src/ui/copy/exercise-requests.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
});

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
  } as unknown as ProgramsClient;
}

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

function renderApp(
  initialEntry: string,
  requests: Partial<ExerciseRequestsClient>,
  media: Partial<ExerciseMediaClient> = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={requests as ExerciseRequestsClient}
        exerciseMediaClient={media as ExerciseMediaClient}
        programsClient={stubProgramsClient()}
      />
    </MemoryRouter>,
  );
}

describe("exercise requests UI", () => {
  it("submits a request from the search form", async () => {
    const submitRequest = vi.fn().mockResolvedValue({
      outcome: "created",
      request_id: "req-1",
      status: "drafting",
      exercise_id: "ex-1",
    });
    const listSimilar = vi.fn().mockResolvedValue({
      library_matches: [],
      drafts_in_progress: [],
    });
    const getInProgressCount = vi.fn().mockResolvedValue({ in_progress_count: 1 });

    renderApp(`${physioAppExerciseSearchPath("Heel slide")}`, {
      submitRequest,
      listSimilar,
      getInProgressCount,
      listInProgress: vi.fn().mockResolvedValue({ requests: [], in_progress_count: 0 }),
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: SUBMIT_REQUEST })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole("button", { name: SUBMIT_REQUEST }));

    await waitFor(() => {
      expect(submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requested_name: "Heel slide",
          resolution: "submit",
        }),
      );
    });
  });

  it("shows the conflict page after a conflicting submit", async () => {
    const submitRequest = vi.fn().mockResolvedValue({
      outcome: "conflict",
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
      pending: {
        requested_name: "Heel slide",
        exercise_note: "supine",
      },
    });
    const listSimilar = vi.fn().mockResolvedValue({
      library_matches: [],
      drafts_in_progress: [],
    });
    const getInProgressCount = vi.fn().mockResolvedValue({ in_progress_count: 0 });

    renderApp(`${physioAppExerciseSearchPath("Heel slide")}`, {
      submitRequest,
      listSimilar,
      getInProgressCount,
      listInProgress: vi.fn(),
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: SUBMIT_REQUEST })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: SUBMIT_REQUEST }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: CONFLICT_HEADING }),
      ).toBeInTheDocument();
    });
  });

  it("merges on the conflict page and navigates to requests", async () => {
    const submitRequest = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: "conflict",
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
        pending: { requested_name: "Heel slide", exercise_note: null },
      })
      .mockResolvedValueOnce({
        outcome: "merged",
        request_id: "req-other",
        exercise_id: "ex-d",
      });

    renderApp(
      fillPhysioAppRoutePattern("requestConflict"),
      {
        submitRequest,
        getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 1 }),
        listInProgress: vi
          .fn()
          .mockResolvedValue({ requests: [], in_progress_count: 1 }),
      },
      {
        getRegenerationQuota: vi.fn(),
      },
    );

    const state = {
      pending: { requested_name: "Heel slide", exercise_note: null },
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

    cleanup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: fillPhysioAppRoutePattern("requestConflict"),
            state,
          },
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={
            {
              submitRequest,
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 1 }),
              listInProgress: vi
                .fn()
                .mockResolvedValue({ requests: [], in_progress_count: 1 }),
            } as unknown as ExerciseRequestsClient
          }
          programsClient={stubProgramsClient()}
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("button", { name: MERGE_MY_CHANGES }));

    await waitFor(() => {
      expect(submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          resolution: "merge",
          conflict_request_id: "req-other",
        }),
      );
    });
  });

  it("edits a draft field and approves with the own-request toast", async () => {
    const draftView = {
      request_id: "req-1",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting" as const,
      requested_by: DEV_PRACTITIONER_ID,
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

    const updateDraft = vi.fn().mockResolvedValue({
      ...draftView,
      draft: { ...draftView.draft!, description: "Updated" },
    });
    const approveRequest = vi.fn().mockResolvedValue({
      request_id: "req-1",
      exercise_id: "ex-1",
      exercise_version_id: "ver-1",
      version_number: 1 as const,
      approved_by: DEV_PRACTITIONER_ID,
      approved_at: "2026-10-30T12:00:00.000Z",
    });

    renderApp(
      fillPhysioAppRoutePattern("requestReview", { requestId: "req-1" }),
      {
        getRequest: vi.fn().mockResolvedValue(draftView),
        updateDraft,
        approveRequest,
        getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
        listInProgress: vi
          .fn()
          .mockResolvedValue({ requests: [], in_progress_count: 0 }),
      },
      {
        getRegenerationQuota: vi.fn().mockResolvedValue({
          limit: 5,
          used: 0,
          remaining: 5,
          limitReached: false,
        }),
      },
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: APPROVE })).toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole("button", { name: `Edit ${DESCRIPTION_FIELD}` }),
    );
    const textarea = screen.getByLabelText(DESCRIPTION_FIELD);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateDraft).toHaveBeenCalledWith("req-1", { description: "Updated" });
    });

    await userEvent.click(screen.getByRole("button", { name: APPROVE }));

    await waitFor(() => {
      expect(approveRequest).toHaveBeenCalledWith("req-1");
      expect(screen.getByText(TOAST_APPROVE_OWN)).toBeInTheDocument();
    });
  });

  it("lists in-progress requests", async () => {
    renderApp(fillPhysioAppRoutePattern("requests"), {
      getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 1 }),
      listInProgress: vi.fn().mockResolvedValue({
        in_progress_count: 1,
        requests: [
          {
            request_id: "req-1",
            requested_name: "Heel slide",
            exercise_note: null,
            status: "drafting",
            requested_by: DEV_PRACTITIONER_ID,
            requested_by_email: "kojo@example.com",
            exercise_id: "ex-1",
            draft_title: "Heel slide",
            updated_at: "2026-10-30T12:00:00.000Z",
          },
        ],
      }),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: REQUESTS_HEADING }),
      ).toBeInTheDocument();
      expect(screen.getByText("Heel slide")).toBeInTheDocument();
    });
  });
});
