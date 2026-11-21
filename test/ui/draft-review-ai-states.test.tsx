/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DraftReviewPage } from "../../src/ui/exercise-requests/DraftReviewPage.js";
import {
  setExerciseRequestsClientForTests,
  type ExerciseRequestsClient,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  setExerciseMediaClientForTests,
  type ExerciseMediaClient,
} from "../../src/ui/api/exercise-media-client.js";
import { AI_DRAFTING, GENERATING } from "../../src/ui/copy/exercise-requests.js";
import {
  DRAFT_AI_TEXT_FAILURE,
  DRAFT_GENERATION_STARTED_ELSEWHERE,
  DRAFT_REGENERATE_TEXT,
} from "../../src/ui/copy/draft-review-ai-states.js";
import { NavigationTestProviders } from "./navigation-test-providers.js";
import { ExerciseRequestsApiProvider } from "../../src/ui/api/exercise-requests-context.js";
import { ExerciseMediaApiProvider } from "../../src/ui/api/exercise-media-context.js";
import { ToastProvider } from "../../src/ui/components/Toast.js";
import { FAKE_UI_PRACTITIONER_ID } from "./fake-practitioner-session-fixture.js";
import type { ExerciseRequestDraftView } from "../../src/services/exercise-requests/types.js";

afterEach(() => {
  cleanup();
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
});

function stubMediaClient(): ExerciseMediaClient {
  return {
    getRegenerationQuota: vi.fn().mockResolvedValue({
      limit: 5,
      used: 0,
      remaining: 5,
      limitReached: false,
    }),
    regenerateDraftMedia: vi.fn(),
  } as unknown as ExerciseMediaClient;
}

function renderReview(
  view: ExerciseRequestDraftView,
  generateResult?: Awaited<ReturnType<ExerciseRequestsClient["generateRequest"]>>,
) {
  const mediaClient = stubMediaClient();
  const requestsClient = {
    getRequest: vi.fn().mockResolvedValue(view),
    generateRequest: vi.fn().mockResolvedValue(
      generateResult ?? {
        outcome: "complete",
        view: {
          ...view,
          generation: { generation_in_progress: false, first_draft_complete: true },
        },
      },
    ),
    updateDraft: vi.fn(),
    approveRequest: vi.fn(),
    getInProgressCount: vi.fn(),
    listInProgress: vi.fn(),
    listSimilar: vi.fn(),
    submitRequest: vi.fn(),
  } as unknown as ExerciseRequestsClient;
  setExerciseMediaClientForTests(mediaClient);
  setExerciseRequestsClientForTests(requestsClient);

  render(
    <MemoryRouter initialEntries={["/requests/req-1"]}>
      <NavigationTestProviders>
        <ExerciseRequestsApiProvider client={requestsClient}>
          <ExerciseMediaApiProvider client={mediaClient}>
            <ToastProvider>
              <Routes>
                <Route path="/requests/:requestId" element={<DraftReviewPage />} />
              </Routes>
            </ToastProvider>
          </ExerciseMediaApiProvider>
        </ExerciseRequestsApiProvider>
      </NavigationTestProviders>
    </MemoryRouter>,
  );
}

describe("Draft review AI states (DIDI-1210)", () => {
  it("shows the teal AI drafting strip while the first draft is not complete", async () => {
    const generatingView: ExerciseRequestDraftView = {
      request_id: "req-1",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting",
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "k@example.com",
      exercise_id: null,
      generation: { generation_in_progress: true, first_draft_complete: false },
      draft: null,
    };
    renderReview(generatingView, {
      outcome: "in_progress",
      view: generatingView,
      started_elsewhere: false,
    });
    await waitFor(() => {
      expect(screen.getByTestId("ex-review-ai-strip")).toBeTruthy();
    });
    expect(screen.getByText(AI_DRAFTING)).toBeTruthy();
    expect(screen.getAllByText(GENERATING).length).toBeGreaterThan(0);
  });

  it("shows elsewhere copy when generation is in progress for a non-requester", async () => {
    renderReview({
      request_id: "req-1",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting",
      requested_by: "other-practitioner",
      requested_by_email: "other@example.com",
      exercise_id: null,
      generation: { generation_in_progress: true, first_draft_complete: false },
      draft: null,
    });
    await waitFor(() => {
      expect(screen.getByText(DRAFT_GENERATION_STARTED_ELSEWHERE)).toBeTruthy();
    });
  });

  it("shows text failure with Regenerate text", async () => {
    renderReview(
      {
        request_id: "req-1",
        requested_name: "Heel slide",
        exercise_note: null,
        status: "drafting",
        requested_by: FAKE_UI_PRACTITIONER_ID,
        requested_by_email: "k@example.com",
        exercise_id: null,
        generation: { generation_in_progress: false, first_draft_complete: false },
        draft: null,
      },
      {
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_request_failed",
        view: null,
      },
    );
    expect(await screen.findByText(DRAFT_AI_TEXT_FAILURE)).toBeTruthy();
    expect(screen.getByRole("button", { name: DRAFT_REGENERATE_TEXT })).toBeTruthy();
  });
});
