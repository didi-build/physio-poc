/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DraftReviewPage } from "../../src/ui/exercise-requests/DraftReviewPage.js";
import {
  setExerciseRequestsClientForTests,
  type ExerciseRequestsClient,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  ExerciseMediaRequestError,
  setExerciseMediaClientForTests,
  type ExerciseMediaClient,
} from "../../src/ui/api/exercise-media-client.js";
import {
  AI_DRAFTING,
  APPROVE,
  DAILY_LIMIT_REACHED,
  DRAFT_NOT_APPROVED,
  GENERATING,
  REGENERATE,
  REGENERATE_SHEET_TITLE,
} from "../../src/ui/copy/exercise-requests.js";
import {
  DRAFT_AI_IMAGE_FAILURE,
  DRAFT_AI_LIMIT_TRY_TOMORROW,
  DRAFT_AI_TEXT_FAILURE,
  DRAFT_GENERATION_STARTED_ELSEWHERE,
  DRAFT_REGEN_SCOPE_ALL_LABEL,
  DRAFT_REGEN_SCOPE_IMAGES_HINT,
  DRAFT_REGEN_TEXT_ONLY_HINT,
  DRAFT_REGEN_TEXT_ONLY_LABEL,
  DRAFT_REGENERATE_TEXT,
  DRAFT_REGENERATING_TEXT,
} from "../../src/ui/copy/draft-review-ai-states.js";
import { AUTO_SAVE_TRY_AGAIN } from "../../src/ui/copy/programs.js";
import { NavigationTestProviders } from "./navigation-test-providers.js";
import { ExerciseRequestsApiProvider } from "../../src/ui/api/exercise-requests-context.js";
import { ExerciseMediaApiProvider } from "../../src/ui/api/exercise-media-context.js";
import { ToastProvider } from "../../src/ui/components/Toast.js";
import { FAKE_UI_PRACTITIONER_ID } from "./fake-practitioner-session-fixture.js";
import { mockMinWidth1024 } from "./setup.js";
import type { ExerciseRequestDraftView } from "../../src/services/exercise-requests/types.js";

afterEach(() => {
  cleanup();
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
});

const PIN_G1 = "The AI couldn't write the text.";
const PIN_G2 = "The AI couldn't make the images. The text is kept.";
const PIN_G3 = "You can try again tomorrow.";
const PIN_G8 = "Already started. This page updates when the draft is ready.";
const PIN_G11 = "Try again";

function draftBody(
  title = "Heel slide",
): NonNullable<ExerciseRequestDraftView["draft"]> {
  return {
    exercise_version_id: "ver-1",
    version_number: 1,
    title,
    description: "Description copy",
    equipment: "",
    starting_position: "On your back",
    steps: "",
    common_mistakes: "",
    regressions: "",
    progressions: "",
    precautions: "",
    cue_stretching: null,
    cue_isometric: null,
    cue_concentric: null,
    cue_eccentric: null,
  };
}

function stubMediaClient(
  overrides: Partial<ExerciseMediaClient> = {},
): ExerciseMediaClient {
  return {
    getRegenerationQuota: vi.fn().mockResolvedValue({
      limit: 5,
      used: 0,
      remaining: 5,
      limitReached: false,
    }),
    regenerateDraftMedia: vi.fn().mockResolvedValue({}),
    draftStillObjectUrl: vi
      .fn()
      .mockImplementation(async (_id, which) =>
        which === "start" ? "blob:draft-start" : "blob:draft-end",
      ),
    ...overrides,
  } as unknown as ExerciseMediaClient;
}

function renderReview(
  view: ExerciseRequestDraftView,
  options?: {
    generateResult?: Awaited<ReturnType<ExerciseRequestsClient["generateRequest"]>>;
    mediaClient?: ExerciseMediaClient;
    requestsClient?: ExerciseRequestsClient;
    widthPx?: number;
  },
) {
  const widthPx = options?.widthPx ?? 1280;
  mockMinWidth1024(widthPx >= 1024);
  const mediaClient = options?.mediaClient ?? stubMediaClient();
  const requestsClient =
    options?.requestsClient ??
    ({
      getRequest: vi.fn().mockResolvedValue(view),
      generateRequest: vi.fn().mockResolvedValue(
        options?.generateResult ?? {
          outcome: "complete",
          view: {
            ...view,
            generation: { generation_in_progress: false, first_draft_complete: true },
          },
        },
      ),
      regenerateDraftText: vi.fn(),
      updateDraft: vi.fn(),
      approveRequest: vi.fn(),
      getInProgressCount: vi.fn(),
      listInProgress: vi.fn(),
      listSimilar: vi.fn(),
      submitRequest: vi.fn(),
    } as unknown as ExerciseRequestsClient);
  setExerciseRequestsClientForTests(requestsClient);

  const container = document.createElement("div");
  container.style.width = `${widthPx}px`;
  document.body.appendChild(container);

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
    { container },
  );
  return { mediaClient, requestsClient };
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
      generateResult: {
        outcome: "in_progress",
        view: generatingView,
        started_elsewhere: false,
      },
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
      expect(screen.getByText(PIN_G8)).toBeTruthy();
    });
  });

  it("shows text failure with Regenerate text (G1, G6 literals)", async () => {
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
        generateResult: {
          outcome: "text_failed",
          error: "deepinfra_exercise_draft_request_failed",
          view: null,
        },
      },
    );
    expect(await screen.findByText(DRAFT_AI_TEXT_FAILURE)).toBeTruthy();
    expect(screen.getByText(PIN_G1)).toBeTruthy();
    expect(screen.getByRole("button", { name: DRAFT_REGENERATE_TEXT })).toBeTruthy();
  });

  it("keeps Approve and Regenerate disabled until the first draft is complete", async () => {
    renderReview({
      request_id: "req-1",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting",
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "k@example.com",
      exercise_id: "ex-1",
      generation: { generation_in_progress: true, first_draft_complete: false },
      draft: draftBody(),
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: APPROVE })).toBeDisabled();
      expect(screen.getByRole("button", { name: REGENERATE })).toBeDisabled();
    });
  });
});

describe.each([390, 1280])("Draft review AI states at %i px (DIDI-1210)", (widthPx) => {
  it("shows image failure with Try again while keeping read-only text (G2, G11)", async () => {
    renderReview(
      {
        request_id: "req-1",
        requested_name: "Heel slide",
        exercise_note: null,
        status: "drafting",
        requested_by: FAKE_UI_PRACTITIONER_ID,
        requested_by_email: "k@example.com",
        exercise_id: "ex-1",
        generation: { generation_in_progress: false, first_draft_complete: false },
        draft: draftBody(),
      },
      {
        widthPx,
        generateResult: {
          outcome: "images_failed",
          view: {
            request_id: "req-1",
            requested_name: "Heel slide",
            exercise_note: null,
            status: "drafting",
            requested_by: FAKE_UI_PRACTITIONER_ID,
            requested_by_email: "k@example.com",
            exercise_id: "ex-1",
            generation: {
              generation_in_progress: false,
              first_draft_complete: false,
            },
            draft: draftBody(),
          },
        },
      },
    );
    expect(await screen.findByText(DRAFT_AI_IMAGE_FAILURE)).toBeTruthy();
    expect(screen.getByText(PIN_G2)).toBeTruthy();
    expect(screen.getByText("On your back")).toBeTruthy();
    expect(screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN })).toBeTruthy();
    expect(screen.getByRole("button", { name: PIN_G11 })).toBeTruthy();
  });

  it("shows daily limit on generate with pinned copy", async () => {
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
        widthPx,
        generateResult: {
          outcome: "daily_limit",
          view: {
            request_id: "req-1",
            requested_name: "Heel slide",
            exercise_note: null,
            status: "drafting",
            requested_by: FAKE_UI_PRACTITIONER_ID,
            requested_by_email: "k@example.com",
            exercise_id: null,
            generation: {
              generation_in_progress: false,
              first_draft_complete: false,
            },
            draft: null,
          },
        },
      },
    );
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(DAILY_LIMIT_REACHED)).toBeTruthy();
    expect(within(alert).getByText(DRAFT_AI_LIMIT_TRY_TOMORROW)).toBeTruthy();
    expect(within(alert).getByText(PIN_G3)).toBeTruthy();
  });

  it("loads draft still images for the requester when the draft is complete", async () => {
    renderReview(
      {
        request_id: "req-1",
        requested_name: "Heel slide",
        exercise_note: null,
        status: "drafting",
        requested_by: FAKE_UI_PRACTITIONER_ID,
        requested_by_email: "k@example.com",
        exercise_id: "ex-1",
        generation: { generation_in_progress: false, first_draft_complete: true },
        draft: draftBody(),
      },
      { widthPx },
    );
    await waitFor(() => {
      const images = screen.getAllByRole("img");
      expect(images.some((img) => img.getAttribute("src") === "blob:draft-start")).toBe(
        true,
      );
      expect(images.some((img) => img.getAttribute("src") === "blob:draft-end")).toBe(
        true,
      );
    });
    expect(screen.queryByText(/AI image/i)).toBeNull();
  });

  it("enables Approve when the first draft is complete and shows the approved banner area", async () => {
    renderReview(
      {
        request_id: "req-1",
        requested_name: "Heel slide",
        exercise_note: null,
        status: "drafting",
        requested_by: FAKE_UI_PRACTITIONER_ID,
        requested_by_email: "k@example.com",
        exercise_id: "ex-1",
        generation: { generation_in_progress: false, first_draft_complete: true },
        draft: draftBody(),
      },
      { widthPx },
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: APPROVE })).not.toBeDisabled();
    });
    expect(screen.getByText(DRAFT_NOT_APPROVED)).toBeTruthy();
    expect(screen.queryByTestId("ex-review-ai-strip")).toBeNull();
  });

  it("surfaces regenerate media 502 errors with image failure copy", async () => {
    const mediaClient = stubMediaClient({
      regenerateDraftMedia: vi.fn().mockRejectedValue(
        new ExerciseMediaRequestError("upstream failed", {
          status: 502,
          error: "image_generation_request_failed",
        }),
      ),
    });
    renderReview(
      {
        request_id: "req-1",
        requested_name: "Heel slide",
        exercise_note: null,
        status: "drafting",
        requested_by: FAKE_UI_PRACTITIONER_ID,
        requested_by_email: "k@example.com",
        exercise_id: "ex-1",
        generation: { generation_in_progress: false, first_draft_complete: true },
        draft: draftBody(),
      },
      { widthPx, mediaClient },
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: REGENERATE })).not.toBeDisabled();
    });
    await userEvent.click(screen.getByRole("button", { name: REGENERATE }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Regenerate images" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(PIN_G2)).toBeTruthy();
  });

  it("surfaces regenerate media daily cap with pinned copy", async () => {
    const mediaClient = stubMediaClient({
      regenerateDraftMedia: vi.fn().mockRejectedValue(
        new ExerciseMediaRequestError("limit", {
          status: 429,
          error: "daily_limit_reached",
        }),
      ),
    });
    renderReview(
      {
        request_id: "req-1",
        requested_name: "Heel slide",
        exercise_note: null,
        status: "drafting",
        requested_by: FAKE_UI_PRACTITIONER_ID,
        requested_by_email: "k@example.com",
        exercise_id: "ex-1",
        generation: { generation_in_progress: false, first_draft_complete: true },
        draft: draftBody(),
      },
      { widthPx, mediaClient },
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: REGENERATE })).not.toBeDisabled();
    });
    await userEvent.click(screen.getByRole("button", { name: REGENERATE }));
    await userEvent.click(screen.getByRole("button", { name: "Regenerate images" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(DAILY_LIMIT_REACHED);
    expect(alert.textContent).toContain(PIN_G3);
  });
});

describe("Regenerate sheet copy (DIDI-1210)", () => {
  it("shows reworded scope labels without video options", async () => {
    renderReview({
      request_id: "req-1",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting",
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "k@example.com",
      exercise_id: "ex-1",
      generation: { generation_in_progress: false, first_draft_complete: true },
      draft: draftBody(),
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: REGENERATE })).not.toBeDisabled();
    });
    await userEvent.click(screen.getByRole("button", { name: REGENERATE }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(REGENERATE_SHEET_TITLE)).toBeTruthy();
    expect(within(dialog).getByText(DRAFT_REGEN_SCOPE_ALL_LABEL)).toBeTruthy();
    expect(within(dialog).getByText("Text and images")).toBeTruthy();
    expect(within(dialog).getByText(DRAFT_REGEN_TEXT_ONLY_LABEL)).toBeTruthy();
    expect(within(dialog).getByText("Text only")).toBeTruthy();
    expect(within(dialog).getByText(DRAFT_REGEN_TEXT_ONLY_HINT)).toBeTruthy();
    expect(
      within(dialog).getByText("All the written fields. Images stay."),
    ).toBeTruthy();
    expect(within(dialog).getByText(DRAFT_REGEN_SCOPE_IMAGES_HINT)).toBeTruthy();
    expect(within(dialog).getByText("Start and end images. Text stays.")).toBeTruthy();
    expect(screen.queryByText("The 6s loop")).toBeNull();
    expect(screen.queryByText("Regenerate video")).toBeNull();
  });

  it("runs text regenerate with a note and shows the busy string (G7)", async () => {
    let resolveText: (value: { view: ExerciseRequestDraftView }) => void = () => {};
    const textPromise = new Promise<{ view: ExerciseRequestDraftView }>((resolve) => {
      resolveText = resolve;
    });
    const completedView: ExerciseRequestDraftView = {
      request_id: "req-1",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting",
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "k@example.com",
      exercise_id: "ex-1",
      generation: { generation_in_progress: false, first_draft_complete: true },
      draft: draftBody("Updated title"),
    };
    const requestsClient = {
      getRequest: vi.fn().mockResolvedValue(completedView),
      generateRequest: vi.fn(),
      regenerateDraftText: vi.fn().mockReturnValue(textPromise),
      updateDraft: vi.fn(),
      approveRequest: vi.fn(),
      getInProgressCount: vi.fn(),
      listInProgress: vi.fn(),
      listSimilar: vi.fn(),
      submitRequest: vi.fn(),
    } as unknown as ExerciseRequestsClient;

    renderReview(completedView, { requestsClient });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: REGENERATE })).not.toBeDisabled();
    });
    await userEvent.click(screen.getByRole("button", { name: REGENERATE }));
    const dialog = await screen.findByRole("dialog");
    const textOnlyLabel = within(dialog)
      .getByText("Text only")
      .closest("label") as HTMLLabelElement;
    await userEvent.click(textOnlyLabel);
    const note = within(dialog).getByLabelText(/Note for the AI/i);
    await userEvent.type(note, "forearm support");
    await userEvent.click(
      within(dialog).getByRole("button", { name: DRAFT_REGENERATE_TEXT }),
    );
    expect(await screen.findByText(DRAFT_REGENERATING_TEXT)).toBeTruthy();
    expect(
      screen.getByText("Regenerating the text. Everything else stays usable."),
    ).toBeTruthy();
    resolveText({ view: completedView });
    await waitFor(() => {
      expect(requestsClient.regenerateDraftText).toHaveBeenCalledWith(
        "req-1",
        "forearm support",
      );
    });
  });
});
