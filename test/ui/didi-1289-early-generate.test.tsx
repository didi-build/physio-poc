/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftReviewPage } from "../../src/ui/exercise-requests/DraftReviewPage.js";
import {
  setExerciseRequestsClientForTests,
  type ExerciseRequestsClient,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  setExerciseMediaClientForTests,
  type ExerciseMediaClient,
} from "../../src/ui/api/exercise-media-client.js";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
    draftStillObjectUrl: vi.fn().mockResolvedValue(null),
    regenerateDraftMedia: vi.fn(),
  } as unknown as ExerciseMediaClient;
}

describe("DIDI-1289 early first /generate", () => {
  it("calls generate as soon as sessionIdentityReady and view match requester", async () => {
    const view: ExerciseRequestDraftView = {
      request_id: "req-early-gen",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting",
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "k@example.com",
      exercise_id: null,
      generation: { generation_in_progress: false, first_draft_complete: false },
      draft: null,
    };
    const generateRequest = vi.fn().mockResolvedValue({
      outcome: "in_progress",
      started_elsewhere: false,
      view: {
        ...view,
        generation: { generation_in_progress: true, first_draft_complete: false },
      },
    });
    const requestsClient = {
      getRequest: vi.fn().mockResolvedValue(view),
      generateRequest,
      regenerateDraftText: vi.fn(),
      updateDraft: vi.fn(),
      approveRequest: vi.fn(),
      getInProgressCount: vi.fn(),
      listInProgress: vi.fn(),
      listSimilar: vi.fn(),
      submitRequest: vi.fn(),
    } as unknown as ExerciseRequestsClient;
    setExerciseRequestsClientForTests(requestsClient);
    setExerciseMediaClientForTests(stubMediaClient());

    render(
      <MemoryRouter initialEntries={["/requests/req-early-gen"]}>
        <NavigationTestProviders>
          <ExerciseRequestsApiProvider client={requestsClient}>
            <ExerciseMediaApiProvider client={stubMediaClient()}>
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

    await waitFor(() => {
      expect(generateRequest).toHaveBeenCalledTimes(1);
      expect(generateRequest).toHaveBeenCalledWith("req-early-gen");
    });
  });
});
