/**
 * @vitest-environment jsdom
 *
 * Test-only follow-up for DIDI-1306 (surviving mutants F17d, G2r3, B10b2, B10b3).
 */
import "./setup.js";
import { ensureMatchMediaStub } from "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProgramsApiError,
  type ProgramsClient,
} from "../../src/ui/api/programs-client.js";
import type { ExerciseMediaClient } from "../../src/ui/api/exercise-media-client.js";
import {
  type ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import { setExerciseMediaClientForTests } from "../../src/ui/api/exercise-media-client.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";
import type { ProgramShareConnectorView } from "../../src/services/programs/program-publish-service.js";
import type { ExerciseRequestDraftView } from "../../src/services/exercise-requests/types.js";
import { PublishSheet } from "../../src/ui/programs/PublishSheet.js";
import { PUBLISH_NOW, PUBLISH_SHEET_TITLE } from "../../src/ui/copy/program-publish.js";
import {
  REFRESH_FAILURE_PRIMARY,
  TRY_AGAIN,
  TRYING_AGAIN,
} from "../../src/ui/copy/shared-load-states.js";
import { didi1273FailedSaveMessage } from "../../src/ui/shared-load-states/failed-save.js";
import { REGENERATE, REGENERATE_IMAGES } from "../../src/ui/copy/exercise-requests.js";
import { DESCRIPTION_FIELD } from "../../src/ui/copy/exercise-library.js";
import { ExerciseMediaRequestError } from "../../src/ui/api/exercise-media-client.js";
import { FAKE_UI_PRACTITIONER_ID } from "./fake-practitioner-session-fixture.js";
import { invalidateExerciseRequestReads } from "../../src/ui/api/navigation-read-cache-invalidation.js";
import { DraftReviewPage } from "../../src/ui/exercise-requests/DraftReviewPage.js";
import { NavigationTestProviders } from "./navigation-test-providers.js";
import { ExerciseRequestsApiProvider } from "../../src/ui/api/exercise-requests-context.js";
import { ExerciseMediaApiProvider } from "../../src/ui/api/exercise-media-context.js";
import { ToastProvider } from "../../src/ui/components/Toast.js";
import { Route, Routes } from "react-router-dom";

const PIN_G2 = "The AI couldn't make the images. The text is kept.";
const PIN_REGENERATE_FAILED = "Couldn't regenerate the images. Try again.";

afterEach(() => {
  cleanup();
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
  vi.useRealTimers();
  ensureMatchMediaStub();
});

function programAndShare(): {
  program: ProgramBuilderView;
  shareView: ProgramShareConnectorView;
} {
  const program: ProgramBuilderView = {
    program_id: "p1",
    code: "PRG-7K3Q",
    name: "Knee rehab",
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: 1,
    library_updates_to_review: 0,
    rows: [
      {
        id: "r1",
        position: 0,
        kind: "exercise",
        exercise_id: "ex1",
        exercise_version_id: "v1",
        exercise_request_id: null,
        pinned_version_number: 1,
        prescription_type: "stretching",
        params: { hold_s: 30 },
        params_source: "global_defaults",
        resolved_params: { hold_s: 30 },
        resolved_params_source: "global_defaults",
        text_snapshot: { title: "Heel slide" },
        note: null,
        library_update: null,
        exercise_version_choices: [],
      },
    ],
    open_share_link: false,
    share_link_status: "none",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
    type_mismatch_placeholder_count: 0,
  };
  const shareView: ProgramShareConnectorView = {
    display_state: "draft_only",
    share_link: "",
    share_link_status: "none",
    share_link_state: "none",
    expires_at: null,
    open_share_link: false,
    draft: { version: 1, updated_at: "2026-10-24T12:00:00.000Z" },
    published: null,
    program_code: "PRG-7K3Q",
    program_name: "Knee rehab",
    link_expires_in: null,
    link_expires_on: null,
    practitioner_default_expires_in: "1_year",
    publish_change_lines: [],
    published_at: null,
  };
  return { program, shareView };
}

function completeDraftView(): ExerciseRequestDraftView {
  return {
    request_id: "req-1306",
    requested_name: "Heel slide",
    exercise_note: null,
    status: "drafting",
    requested_by: FAKE_UI_PRACTITIONER_ID,
    requested_by_email: "k@example.com",
    exercise_id: "ex-1",
    generation: { generation_in_progress: false, first_draft_complete: true },
    draft: {
      exercise_version_id: "ver-1",
      version_number: 1,
      title: "Heel slide",
      description: "Desc",
      equipment: "",
      starting_position: "On your back",
      ending_position: "",
      steps: "Step",
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

function draftingInProgressView(): ExerciseRequestDraftView {
  return {
    request_id: "req-1306-poll",
    requested_name: "Heel slide",
    exercise_note: null,
    status: "drafting",
    requested_by: FAKE_UI_PRACTITIONER_ID,
    requested_by_email: "k@example.com",
    exercise_id: null,
    generation: { generation_in_progress: true, first_draft_complete: false },
    draft: null,
  };
}

describe("DIDI-1306 surviving mutants", () => {
  beforeEach(() => {
    ensureMatchMediaStub();
  });

  it("F17d: PublishSheet refocuses failed-save alert after non-validation ProgramsApiError retry fails", async () => {
    let rejectHang!: (error: Error) => void;
    const publishProgram = vi
      .fn()
      .mockRejectedValueOnce(new ProgramsApiError("request_failed", "request_failed"))
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );
    const { program, shareView } = programAndShare();
    render(
      <MemoryRouter>
        <PublishSheet
          open
          program={program}
          shareView={shareView}
          client={
            {
              publishProgram,
              updateProgramName: vi.fn(),
            } as unknown as ProgramsClient
          }
          nameDraft="Knee rehab"
          showNameField={false}
          onNameChange={() => {}}
          onProgramUpdated={() => {}}
          onClose={() => {}}
          onPublished={() => {}}
          onNotYet={() => {}}
          onRemovePlaceholder={() => {}}
        />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
    await userEvent.click(within(dialog).getByRole("button", { name: PUBLISH_NOW }));
    await waitFor(() => {
      expect(
        within(dialog).getByTestId("program-publish-failed-save-alert"),
      ).toBeInTheDocument();
    });
    expect(
      within(dialog).getByText(didi1273FailedSaveMessage("program_publish")),
    ).toBeInTheDocument();
    const failedSaveAlert = within(dialog).getByTestId(
      "program-publish-failed-save-alert",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: TRY_AGAIN }));
    expect(failedSaveAlert).toBeInTheDocument();
    const tryingButton = within(dialog).getByRole("button", { name: TRYING_AGAIN });
    expect(tryingButton).toBeDisabled();
    expect(tryingButton).toHaveTextContent(TRYING_AGAIN);
    rejectHang(new ProgramsApiError("request_failed", "request_failed"));
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
    });
    expect(document.activeElement).toBe(failedSaveAlert);
    expect(publishProgram).toHaveBeenCalledTimes(2);
  });

  it("G2r3: image_generation_network_failed on regenerate shows failed-save, not G2", async () => {
    const view = completeDraftView();
    const mediaClient = {
      getRegenerationQuota: vi.fn().mockResolvedValue({
        limit: 5,
        used: 0,
        remaining: 5,
        limitReached: false,
      }),
      regenerateDraftMedia: vi.fn().mockRejectedValue(
        new ExerciseMediaRequestError("network", {
          status: 504,
          error: "image_generation_network_failed",
        }),
      ),
      draftStillObjectUrl: vi.fn().mockResolvedValue(null),
    } as unknown as ExerciseMediaClient;
    const requestsClient = {
      getRequest: vi.fn().mockResolvedValue(view),
      generateRequest: vi.fn(),
      regenerateDraftText: vi.fn(),
      updateDraft: vi.fn(),
      approveRequest: vi.fn(),
      getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
      listInProgress: vi.fn(),
      listSimilar: vi.fn(),
      submitRequest: vi.fn(),
    } as unknown as ExerciseRequestsClient;

    render(
      <MemoryRouter initialEntries={["/requests/req-1306"]}>
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: REGENERATE })).not.toBeDisabled();
    });
    await userEvent.click(screen.getByRole("button", { name: REGENERATE }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: REGENERATE_IMAGES }),
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("request-regenerate-media-failed-save-alert"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(PIN_REGENERATE_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(PIN_G2)).not.toBeInTheDocument();
  });

  function renderDraftReview(
    requestId: string,
    requestsClient: ExerciseRequestsClient,
    mediaClient: ExerciseMediaClient,
  ) {
    render(
      <MemoryRouter initialEntries={[`/requests/${requestId}`]}>
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

  it("B10b3: refresh-failure Try again on review content refetches the draft", async () => {
    const view = completeDraftView();
    const updatedView: ExerciseRequestDraftView = {
      ...view,
      draft: view.draft
        ? { ...view.draft, description: "Updated description" }
        : view.draft,
    };
    const getRequest = vi.fn(async () => {
      const callIndex = getRequest.mock.calls.length;
      if (callIndex <= 1) {
        return view;
      }
      if (callIndex === 2) {
        invalidateExerciseRequestReads("req-1306");
        throw new Error("refresh failed");
      }
      return updatedView;
    });
    const updateDraft = vi.fn(async () => updatedView);
    const requestsClient = {
      getRequest,
      updateDraft,
      generateRequest: vi.fn(),
      regenerateDraftText: vi.fn(),
      approveRequest: vi.fn(),
      getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
      listInProgress: vi.fn(),
      listSimilar: vi.fn(),
      submitRequest: vi.fn(),
    } as unknown as ExerciseRequestsClient;
    const mediaClient = {
      getRegenerationQuota: vi.fn().mockResolvedValue({
        limit: 5,
        used: 0,
        remaining: 5,
        limitReached: false,
      }),
      draftStillObjectUrl: vi.fn().mockResolvedValue(null),
      regenerateDraftMedia: vi.fn(),
    } as unknown as ExerciseMediaClient;
    renderDraftReview("req-1306", requestsClient, mediaClient);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: `Edit ${DESCRIPTION_FIELD}` }),
      ).toBeEnabled();
    });
    await userEvent.click(
      screen.getByRole("button", { name: `Edit ${DESCRIPTION_FIELD}` }),
    );
    const field = screen.getByLabelText(DESCRIPTION_FIELD);
    await userEvent.clear(field);
    await userEvent.type(field, "Updated description");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(updateDraft).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(getRequest).toHaveBeenCalledTimes(2);
    });

    const banner = await screen.findByText(REFRESH_FAILURE_PRIMARY);
    const alertRoot = banner.closest("[role='alert']");
    expect(alertRoot).toBeTruthy();
    await userEvent.click(
      within(alertRoot as HTMLElement).getByRole("button", { name: TRY_AGAIN }),
    );

    await waitFor(() => {
      expect(getRequest).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByText("Updated description")).toBeInTheDocument();
  });

  it("B10b2: refresh-failure Try again while drafting shell is up refetches the draft", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = draftingInProgressView();
    let pollRefreshCalls = 0;
    const getRequest = vi.fn(async () => {
      pollRefreshCalls += 1;
      if (pollRefreshCalls === 1 || pollRefreshCalls === 2) {
        return view;
      }
      if (pollRefreshCalls === 3) {
        invalidateExerciseRequestReads("req-1306-poll");
        throw new Error("refresh failed");
      }
      return view;
    });

    const requestsClient = {
      getRequest,
      generateRequest: vi.fn().mockResolvedValue({
        outcome: "in_progress",
        view,
        started_elsewhere: false,
      }),
      updateDraft: vi.fn(),
      regenerateDraftText: vi.fn(),
      approveRequest: vi.fn(),
      getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
      listInProgress: vi.fn(),
      listSimilar: vi.fn(),
      submitRequest: vi.fn(),
    } as unknown as ExerciseRequestsClient;
    const mediaClient = {
      getRegenerationQuota: vi.fn().mockResolvedValue({
        limit: 5,
        used: 0,
        remaining: 5,
        limitReached: false,
      }),
      draftStillObjectUrl: vi.fn().mockResolvedValue(null),
      regenerateDraftMedia: vi.fn(),
    } as unknown as ExerciseMediaClient;
    renderDraftReview("req-1306-poll", requestsClient, mediaClient);

    await waitFor(() => {
      expect(getRequest.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    await vi.advanceTimersByTimeAsync(2100);

    const banner = await screen.findByText(REFRESH_FAILURE_PRIMARY);
    const alertRoot = banner.closest("[role='alert']");
    expect(alertRoot).toBeTruthy();
    const callsBeforeRetry = getRequest.mock.calls.length;
    await userEvent.click(
      within(alertRoot as HTMLElement).getByRole("button", { name: TRY_AGAIN }),
    );

    await waitFor(() => {
      expect(getRequest.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    });
    expect(screen.getByText(view.requested_name)).toBeInTheDocument();
  });
});
