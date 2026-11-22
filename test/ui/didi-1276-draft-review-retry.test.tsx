/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { ensureMatchMediaStub } from "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import {
  ExerciseRequestsRequestError,
  setExerciseRequestsClientForTests,
  type ExerciseRequestsClient,
} from "../../src/ui/api/exercise-requests-client.js";
import { setExerciseMediaClientForTests } from "../../src/ui/api/exercise-media-client.js";
import { PhysioApp } from "../../src/ui/App.js";
import {
  AI_DRAFTING,
  GENERATING,
  USUALLY_READY,
} from "../../src/ui/copy/exercise-requests.js";
import {
  DRAFT_AI_IMAGE_FAILURE,
  DRAFT_AI_TEXT_FAILURE,
} from "../../src/ui/copy/draft-review-ai-states.js";
import { AUTO_SAVE_TRY_AGAIN } from "../../src/ui/copy/programs.js";
import { MemoryRouter } from "react-router-dom";
import { FAKE_UI_PRACTITIONER_ID } from "./fake-practitioner-session-fixture.js";

const PIN_TRY_AGAIN = "Try again";

afterEach(() => {
  cleanup();
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
});

function draftWithText() {
  return {
    request_id: "req-1276",
    requested_name: "Heel slide",
    exercise_note: null,
    status: "drafting" as const,
    requested_by: FAKE_UI_PRACTITIONER_ID,
    requested_by_email: "k@example.com",
    exercise_id: "ex-1",
    generation: { generation_in_progress: false, first_draft_complete: false },
    draft: {
      exercise_version_id: "ver-1",
      version_number: 1,
      title: "Heel slide",
      description: "Has text",
      equipment: "",
      starting_position: "Stand",
      steps: "Step one",
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
}

describe("DIDI-1276 draft review retry and failure mapping", () => {
  beforeEach(() => {
    ensureMatchMediaStub();
  });
  it("maps a thrown generateRequest to image failure when draft text exists (not G2)", async () => {
    const view = draftWithText();
    const generateRequest = vi
      .fn()
      .mockRejectedValue(new ExerciseRequestsRequestError("network", { status: 503 }));
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-1276" }),
        ]}
      >
        <PhysioApp
          exerciseRequestsClient={
            {
              getRequest: vi.fn().mockResolvedValue(view),
              generateRequest,
              regenerateDraftText: vi.fn(),
              updateDraft: vi.fn(),
              approveRequest: vi.fn(),
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
              listInProgress: vi.fn(),
              listSimilar: vi.fn(),
              submitRequest: vi.fn(),
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
              regenerateDraftMedia: vi.fn(),
            } as unknown as import("../../src/ui/api/exercise-media-client.js").ExerciseMediaClient
          }
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(generateRequest).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText(DRAFT_AI_IMAGE_FAILURE)).toBeInTheDocument();
    });
    expect(screen.queryByText(DRAFT_AI_TEXT_FAILURE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: PIN_TRY_AGAIN })).toBeInTheDocument();
    expect(screen.queryByTestId("ex-review-ai-strip")).not.toBeInTheDocument();
  });

  it("clears failure and shows Generating when Try again is pressed", async () => {
    const view = draftWithText();
    const generateRequest = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockImplementation(
        () =>
          new Promise(() => {
            /* hold in flight */
          }),
      );
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-1276" }),
        ]}
      >
        <PhysioApp
          exerciseRequestsClient={
            {
              getRequest: vi.fn().mockResolvedValue(view),
              generateRequest,
              regenerateDraftText: vi.fn(),
              updateDraft: vi.fn(),
              approveRequest: vi.fn(),
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
              listInProgress: vi.fn(),
              listSimilar: vi.fn(),
              submitRequest: vi.fn(),
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
              regenerateDraftMedia: vi.fn(),
            } as unknown as import("../../src/ui/api/exercise-media-client.js").ExerciseMediaClient
          }
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(DRAFT_AI_IMAGE_FAILURE)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN }));
    await waitFor(() => {
      expect(screen.queryByText(DRAFT_AI_IMAGE_FAILURE)).not.toBeInTheDocument();
      expect(screen.getAllByText(GENERATING).length).toBeGreaterThan(0);
    });
  });

  it("shows the AI strip without a failure card for 202 in_progress on retry", async () => {
    const view = draftWithText();
    const generateRequest = vi.fn().mockResolvedValue({
      outcome: "in_progress",
      started_elsewhere: false,
      view: {
        ...view,
        generation: { generation_in_progress: true, first_draft_complete: false },
      },
    });
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-1276" }),
        ]}
      >
        <PhysioApp
          exerciseRequestsClient={
            {
              getRequest: vi.fn().mockResolvedValue(view),
              generateRequest,
              regenerateDraftText: vi.fn(),
              updateDraft: vi.fn(),
              approveRequest: vi.fn(),
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
              listInProgress: vi.fn(),
              listSimilar: vi.fn(),
              submitRequest: vi.fn(),
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
              regenerateDraftMedia: vi.fn(),
            } as unknown as import("../../src/ui/api/exercise-media-client.js").ExerciseMediaClient
          }
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("ex-review-ai-strip")).toBeInTheDocument();
    });
    expect(screen.getByText(AI_DRAFTING)).toBeInTheDocument();
    expect(screen.getByText(USUALLY_READY)).toBeInTheDocument();
    expect(screen.queryByText(DRAFT_AI_TEXT_FAILURE)).not.toBeInTheDocument();
    expect(screen.queryByText(DRAFT_AI_IMAGE_FAILURE)).not.toBeInTheDocument();
  });
});
