/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fillPhysioAppRoutePattern,
  physioAppExerciseSearchPath,
} from "../../src/app-routes.js";
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
import { SUBMIT_REQUEST } from "../../src/ui/copy/exercise-library.js";
import {
  AI_DRAFTING,
  CONFLICT_HEADING,
  DRAFT_NOT_APPROVED,
  MERGE_MY_CHANGES,
  REQUESTS_HEADING,
  REVIEW_BACK,
  REVIEW_DRAFT,
  SUBMIT_ANYWAY,
  VIEW_REQUEST,
} from "../../src/ui/copy/exercise-requests.js";
import type { PractitionerSessionClient } from "../../src/ui/api/practitioner-session-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { FAKE_UI_PRACTITIONER_ID } from "./fake-practitioner-session-fixture.js";
import {
  PIN_AI_DRAFTING,
  PIN_DRAFT_NOT_APPROVED,
  PIN_REVIEW_DRAFT,
  PIN_VIEW_REQUEST,
} from "./didi-1275-pinned-strings.js";

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
  practitionerSessionClient?: PractitionerSessionClient,
) {
  const requestsClient = {
    generateRequest: vi.fn().mockResolvedValue({
      outcome: "in_progress",
      started_elsewhere: false,
      view: null,
    }),
    ...requests,
  } as ExerciseRequestsClient;
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={requestsClient}
        exerciseMediaClient={media as ExerciseMediaClient}
        programsClient={stubProgramsClient()}
        practitionerSessionClient={practitionerSessionClient}
      />
    </MemoryRouter>,
  );
}

describe("DIDI-1275 request review routing", () => {
  it("navigates View request to requestReview after created submit (kills onViewRequest list route mutant)", async () => {
    expect(PIN_VIEW_REQUEST).toBe(VIEW_REQUEST);
    const submitRequest = vi.fn().mockResolvedValue({
      outcome: "created",
      request_id: "req-new-1275",
      status: "drafting",
      exercise_id: null,
    });
    const getRequest = vi.fn().mockResolvedValue({
      request_id: "req-new-1275",
      requested_name: "Sumo squat",
      exercise_note: null,
      status: "drafting",
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "k@example.com",
      exercise_id: null,
      generation: { generation_in_progress: false, first_draft_complete: false },
      draft: null,
    });

    renderApp(
      `${physioAppExerciseSearchPath("Sumo squat")}`,
      {
        submitRequest,
        getRequest,
        listSimilar: vi.fn().mockResolvedValue({
          library_matches: [],
          drafts_in_progress: [],
        }),
        getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 1 }),
        listInProgress: vi
          .fn()
          .mockResolvedValue({ requests: [], in_progress_count: 1 }),
      },
      {
        getRegenerationQuota: vi.fn().mockResolvedValue({
          limit: 5,
          used: 0,
          remaining: 5,
          limitReached: false,
        }),
        draftStillObjectUrl: vi.fn().mockResolvedValue(null),
      },
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: SUBMIT_REQUEST })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: SUBMIT_REQUEST }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: VIEW_REQUEST })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: VIEW_REQUEST }));

    await waitFor(() => {
      expect(getRequest).toHaveBeenCalledWith("req-new-1275", expect.anything());
    });
    expect(screen.getByRole("link", { name: REVIEW_BACK })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: REQUESTS_HEADING }),
    ).not.toBeInTheDocument();
  });

  it("navigates Submit anyway on conflict to requestReview when created (kills conflict created list route mutant)", async () => {
    const submitRequest = vi.fn().mockResolvedValue({
      outcome: "created",
      request_id: "req-conflict-new",
      status: "drafting",
      exercise_id: null,
    });
    const getRequest = vi.fn().mockResolvedValue({
      request_id: "req-conflict-new",
      requested_name: "Sumo squat",
      exercise_note: null,
      status: "drafting",
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "k@example.com",
      exercise_id: null,
      generation: { generation_in_progress: false, first_draft_complete: false },
      draft: null,
    });

    const state = {
      pending: { requested_name: "Sumo squat", exercise_note: null },
      similar_request: {
        request_id: "req-other",
        requested_name: "Sumo squat",
        exercise_note: null,
        requested_by: "other-pract",
        requested_by_email: "other@example.com",
        status: "drafting",
        exercise_id: "ex-d",
        draft_title: "Sumo squat",
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
              getRequest,
              generateRequest: vi.fn().mockResolvedValue({
                outcome: "in_progress",
                started_elsewhere: false,
                view: null,
              }),
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 1 }),
              listInProgress: vi
                .fn()
                .mockResolvedValue({ requests: [], in_progress_count: 1 }),
            } as unknown as ExerciseRequestsClient
          }
          exerciseMediaClient={
            {
              getRegenerationQuota: vi.fn().mockResolvedValue({
                limit: 5,
                used: 0,
                remaining: 5,
                limitReached: false,
              }),
              draftStillObjectUrl: vi.fn().mockResolvedValue(null),
            } as unknown as ExerciseMediaClient
          }
          programsClient={stubProgramsClient()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: CONFLICT_HEADING })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: SUBMIT_ANYWAY }));

    await waitFor(() => {
      expect(submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          resolution: "submit_anyway",
          conflict_request_id: "req-other",
        }),
      );
    });
    expect(
      await screen.findByRole("link", { name: REVIEW_BACK }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(getRequest).toHaveBeenCalledWith("req-conflict-new", expect.anything());
    });
    expect(
      screen.queryByRole("heading", { name: REQUESTS_HEADING }),
    ).not.toBeInTheDocument();
  });

  it("still navigates merge to the requests list", async () => {
    const submitRequest = vi.fn().mockResolvedValue({
      outcome: "merged",
      request_id: "req-other",
      exercise_id: "ex-d",
    });

    const state = {
      pending: { requested_name: "Sumo squat", exercise_note: null },
      similar_request: {
        request_id: "req-other",
        requested_name: "Sumo squat",
        exercise_note: null,
        requested_by: "other-pract",
        requested_by_email: "other@example.com",
        status: "drafting",
        exercise_id: "ex-d",
        draft_title: "Sumo squat",
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
              generateRequest: vi.fn(),
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 1 }),
              listInProgress: vi
                .fn()
                .mockResolvedValue({ requests: [], in_progress_count: 1 }),
            } as unknown as ExerciseRequestsClient
          }
          exerciseMediaClient={
            {
              getRegenerationQuota: vi.fn().mockResolvedValue({
                limit: 5,
                used: 0,
                remaining: 5,
                limitReached: false,
              }),
              draftStillObjectUrl: vi.fn().mockResolvedValue(null),
            } as unknown as ExerciseMediaClient
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

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: REQUESTS_HEADING }),
      ).toBeInTheDocument();
    });
  });

  it("shows review link and AI drafting tag for drafting row without exercise_id (kills canReview exercise_id gate mutant)", async () => {
    expect(PIN_AI_DRAFTING).toBe(AI_DRAFTING);
    expect(PIN_REVIEW_DRAFT).toBe(REVIEW_DRAFT);

    renderApp(fillPhysioAppRoutePattern("requests"), {
      getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 1 }),
      listInProgress: vi.fn().mockResolvedValue({
        in_progress_count: 1,
        requests: [
          {
            request_id: "req-drafting-null",
            requested_name: "Sumo squat",
            exercise_note: null,
            status: "drafting",
            requested_by: FAKE_UI_PRACTITIONER_ID,
            requested_by_email: "k@example.com",
            exercise_id: null,
            draft_title: null,
            updated_at: "2026-10-30T12:00:00.000Z",
          },
        ],
      }),
    });

    const row = await waitFor(() => {
      const el = document.querySelector(".ex-requests-row");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    expect(within(row).getByText(PIN_AI_DRAFTING)).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: PIN_REVIEW_DRAFT })).toHaveAttribute(
      "href",
      fillPhysioAppRoutePattern("requestReview", { requestId: "req-drafting-null" }),
    );
    expect(within(row).queryByText(PIN_DRAFT_NOT_APPROVED)).not.toBeInTheDocument();
  });

  it("shows Draft, not approved on the list when exercise_id is set (kills list tag mutant)", async () => {
    expect(PIN_DRAFT_NOT_APPROVED).toBe(DRAFT_NOT_APPROVED);

    renderApp(fillPhysioAppRoutePattern("requests"), {
      getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 1 }),
      listInProgress: vi.fn().mockResolvedValue({
        in_progress_count: 1,
        requests: [
          {
            request_id: "req-1",
            requested_name: "Sumo squat",
            exercise_note: null,
            status: "drafting",
            requested_by: FAKE_UI_PRACTITIONER_ID,
            requested_by_email: "k@example.com",
            exercise_id: "ex-1",
            draft_title: "Sumo squat (draft title)",
            updated_at: "2026-10-30T12:01:00.000Z",
          },
        ],
      }),
    });

    const row = await waitFor(() => {
      const el = document.querySelector(".ex-requests-row");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(row).getByText(PIN_DRAFT_NOT_APPROVED)).toBeInTheDocument();
    expect(within(row).queryByText(PIN_AI_DRAFTING)).not.toBeInTheDocument();
    expect(within(row).getByText("Sumo squat (draft title)")).toBeInTheDocument();
    expect(
      within(row).getByRole("link", { name: PIN_REVIEW_DRAFT }),
    ).toBeInTheDocument();
  });
});
