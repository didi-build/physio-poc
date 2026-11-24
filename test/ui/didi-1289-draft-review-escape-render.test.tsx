/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
import { NavigationTestProviders } from "./navigation-test-providers.js";
import { ExerciseRequestsApiProvider } from "../../src/ui/api/exercise-requests-context.js";
import { ExerciseMediaApiProvider } from "../../src/ui/api/exercise-media-context.js";
import { ToastProvider } from "../../src/ui/components/Toast.js";
import { FAKE_UI_PRACTITIONER_ID } from "./fake-practitioner-session-fixture.js";
import { AUTO_SAVE_TRY_AGAIN } from "../../src/ui/copy/programs.js";
import { DELETE_DRAFT } from "../../src/ui/copy/delete-exercise-draft.js";
import { DRAFT_GENERATION_STARTED_ELSEWHERE } from "../../src/ui/copy/draft-review-ai-states.js";
import type { ExerciseRequestDraftView } from "../../src/services/exercise-requests/types.js";

const PIN_ESCAPE_MS = 180_000;
const LOCK_AT = "2026-06-01T12:00:00.000Z";

afterEach(() => {
  cleanup();
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
  vi.useRealTimers();
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

function renderDraftReview(
  initialView: ExerciseRequestDraftView,
  options?: {
    generateResult?: Awaited<ReturnType<ExerciseRequestsClient["generateRequest"]>>;
    generatePromise?: Promise<
      Awaited<ReturnType<ExerciseRequestsClient["generateRequest"]>>
    >;
    getRequest?: ExerciseRequestsClient["getRequest"];
  },
) {
  const generateRequest = options?.generatePromise
    ? vi.fn().mockReturnValue(options.generatePromise)
    : vi.fn().mockResolvedValue(
        options?.generateResult ?? {
          outcome: "in_progress",
          view: initialView,
          started_elsewhere: false,
        },
      );
  const getRequest =
    options?.getRequest ?? vi.fn().mockImplementation(async () => initialView);
  const requestsClient = {
    getRequest,
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
    <MemoryRouter initialEntries={["/requests/req-escape"]}>
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
  return { generateRequest, getRequest, requestsClient };
}

function baseIncompleteView(
  generation: ExerciseRequestDraftView["generation"],
): ExerciseRequestDraftView {
  return {
    request_id: "req-escape",
    requested_name: "Heel slide",
    exercise_note: null,
    status: "drafting",
    requested_by: FAKE_UI_PRACTITIONER_ID,
    requested_by_email: "k@example.com",
    exercise_id: null,
    generation,
    draft: null,
  };
}

describe("DIDI-1289 draft review escape (page render)", () => {
  it("shows Try again and enabled Delete when live lock is older than 180000 ms (Already started)", async () => {
    const lockedOld = new Date(Date.now() - PIN_ESCAPE_MS - 5_000).toISOString();
    const view = baseIncompleteView({
      generation_in_progress: true,
      first_draft_complete: false,
      draft_generation_locked_at: lockedOld,
    });
    renderDraftReview(view, {
      generateResult: {
        outcome: "in_progress",
        view,
        started_elsewhere: true,
      },
    });
    await waitFor(() => {
      expect(screen.getByText(DRAFT_GENERATION_STARTED_ELSEWHERE)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeTruthy();
    const deleteBtn = screen.getByRole("button", { name: DELETE_DRAFT });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows Try again when the lock is stale on GET", async () => {
    const view = baseIncompleteView({
      generation_in_progress: false,
      first_draft_complete: false,
      draft_generation_locked_at: LOCK_AT,
    });
    renderDraftReview(view);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeTruthy();
    });
    expect(
      (screen.getByRole("button", { name: DELETE_DRAFT }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("shows Try again when the lock is absent", async () => {
    const view = baseIncompleteView({
      generation_in_progress: false,
      first_draft_complete: false,
      draft_generation_locked_at: null,
    });
    renderDraftReview(view);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeTruthy();
    });
  });

  it("reload with started_elsewhere still offers escape", async () => {
    const view = baseIncompleteView({
      generation_in_progress: false,
      first_draft_complete: false,
      draft_generation_locked_at: null,
    });
    renderDraftReview(view, {
      generateResult: {
        outcome: "in_progress",
        view,
        started_elsewhere: true,
      },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeTruthy();
    });
  });

  it("second tab: elsewhere in progress with stale lock shows Try again", async () => {
    const view = baseIncompleteView({
      generation_in_progress: false,
      first_draft_complete: false,
      draft_generation_locked_at: null,
    });
    renderDraftReview(view, {
      generateResult: {
        outcome: "in_progress",
        view: {
          ...view,
          generation: { ...view.generation, generation_in_progress: true },
        },
        started_elsewhere: true,
      },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeTruthy();
    });
  });

  it("hides Try again and enabled Delete during the first own /generate on a fresh draft", async () => {
    const view = baseIncompleteView({
      generation_in_progress: false,
      first_draft_complete: false,
      draft_generation_locked_at: null,
    });
    let resolveGenerate: (
      value: Awaited<ReturnType<ExerciseRequestsClient["generateRequest"]>>,
    ) => void = () => {};
    const generatePromise = new Promise<
      Awaited<ReturnType<ExerciseRequestsClient["generateRequest"]>>
    >((resolve) => {
      resolveGenerate = resolve;
    });
    const { generateRequest } = renderDraftReview(view, {
      getRequest: vi.fn().mockResolvedValue(view),
      generatePromise,
    });
    await waitFor(() => {
      expect(generateRequest).toHaveBeenCalled();
    });
    expect(screen.queryByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeNull();
    expect(
      (screen.getByRole("button", { name: DELETE_DRAFT }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    resolveGenerate({
      outcome: "in_progress",
      view: {
        ...view,
        generation: { ...view.generation, generation_in_progress: true },
      },
      started_elsewhere: false,
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeNull();
    });
  });

  it("pins the 180000 ms escape boundary on both sides", async () => {
    const t0 = Date.parse(LOCK_AT);
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(t0);
    const view = baseIncompleteView({
      generation_in_progress: true,
      first_draft_complete: false,
      draft_generation_locked_at: LOCK_AT,
    });
    renderDraftReview(view, {
      generateResult: {
        outcome: "in_progress",
        view,
        started_elsewhere: false,
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId("ex-review-ai-strip")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeNull();

    nowSpy.mockReturnValue(t0 + PIN_ESCAPE_MS - 1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });
    expect(screen.queryByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeNull();

    nowSpy.mockReturnValue(t0 + PIN_ESCAPE_MS);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeTruthy();
    });
    nowSpy.mockRestore();
  });
});
