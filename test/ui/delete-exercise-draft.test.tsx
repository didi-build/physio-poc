/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import type { InProgressRequestListItem } from "../../src/services/exercise-requests/types.js";
import { ExerciseRequestsApiProvider } from "../../src/ui/api/exercise-requests-context.js";
import {
  ExerciseRequestsClient,
  ExerciseRequestsRequestError,
} from "../../src/ui/api/exercise-requests-client.js";
import { ToastProvider } from "../../src/ui/components/Toast.js";
import { DraftReviewPage } from "../../src/ui/exercise-requests/DraftReviewPage.js";
import { RequestsAndDraftsPage } from "../../src/ui/exercise-requests/RequestsAndDraftsPage.js";
import { PhysioApp } from "../../src/ui/App.js";
import {
  DRAFT_ITEM_LOAD_BACK,
  DRAFT_ITEM_LOAD_HINT,
  DRAFT_ITEM_LOAD_TITLE,
  LOAD_TRY_AGAIN,
} from "../../src/ui/copy/shared-load-states.js";
import { AI_DRAFTING, REQUESTS_HEADING } from "../../src/ui/copy/exercise-requests.js";
import { NavigationTestProviders } from "./navigation-test-providers.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import type { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import { ExerciseRequestsRefreshProvider } from "../../src/ui/api/exercise-requests-refresh-context.js";
import { ExerciseMediaApiProvider } from "../../src/ui/api/exercise-media-context.js";
import { ExerciseMediaClient } from "../../src/ui/api/exercise-media-client.js";

const PIN_DELETE_DRAFT = "Delete draft";
const PIN_DELETE_ROW = "Delete Wall angels";
const PIN_DELETE_BLOCKED = "You can delete it once the AI finishes drafting.";
const PIN_DIALOG_TITLE = "Delete Wall angels?";
const PIN_DIALOG_OFF_LIST = "It comes off Requests and drafts for every practitioner.";
const PIN_DIALOG_NO_UNDO = "You can't undo this.";
const PIN_TOAST = "Draft deleted. It left Requests and drafts.";
const PIN_CANCEL = "Cancel";
const PIN_D10 = "Couldn't delete the draft. Try again.";
const PIN_D11 = "This draft was approved, so it can no longer be deleted.";
const PIN_D12 = "This draft was deleted. It is no longer in Requests and drafts.";
const PIN_REQUESTS = "Requests";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function listItem(
  overrides: Partial<InProgressRequestListItem> = {},
): InProgressRequestListItem {
  return {
    request_id: "req-list-1",
    requested_name: "Wall angels",
    exercise_note: null,
    status: "drafting",
    requested_by: "11111111-1111-4111-8111-111111111111",
    requested_by_email: "k@example.com",
    exercise_id: "ex-1",
    draft_title: "Wall angels",
    updated_at: "2026-01-01T00:00:00.000Z",
    generation_in_progress: false,
    ...overrides,
  };
}

function renderList(client: ExerciseRequestsClient) {
  return render(
    <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("requests")]}>
      <NavigationTestProviders>
        <ToastProvider>
          <ExerciseRequestsApiProvider client={client}>
            <ExerciseRequestsRefreshProvider onCount={() => {}}>
              <RequestsAndDraftsPage />
            </ExerciseRequestsRefreshProvider>
          </ExerciseRequestsApiProvider>
        </ToastProvider>
      </NavigationTestProviders>
    </MemoryRouter>,
  );
}

function deleteRowAria(title: string): string {
  return `Delete ${title}`;
}

describe("Delete exercise-request draft UI (DIDI-1278)", () => {
  afterEach(() => {
    cleanup();
  });

  it("requires confirmation before POST /withdraw", async () => {
    const withdraw = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ request_id: "req-list-1", status: "withdrawn" }),
      );
    const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/in-progress") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(
          jsonResponse({
            requests: [listItem()],
            in_progress_count: 1,
          }),
        );
      }
      if (url.includes("/withdraw")) {
        return withdraw(input, init);
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_ROW }));
    expect(withdraw).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(PIN_DIALOG_OFF_LIST)).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(withdraw).toHaveBeenCalledTimes(1);
    });
  });

  it("disables delete with blocked copy while generation is running", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        requests: [listItem({ generation_in_progress: true, status: "open" })],
        in_progress_count: 1,
      }),
    );
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeDisabled();
      expect(screen.getByText(PIN_DELETE_BLOCKED)).toBeInTheDocument();
    });
  });

  it("removes a withdrawn row from the list after success", async () => {
    let listed = true;
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/withdraw")) {
        listed = false;
        return Promise.resolve(
          jsonResponse({
            request_id: "req-list-1",
            status: "withdrawn",
            already_withdrawn: false,
          }),
        );
      }
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({
            requests: listed ? [listItem()] : [],
            in_progress_count: listed ? 1 : 0,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByText("Wall angels")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_ROW }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(screen.queryByText("Wall angels")).not.toBeInTheDocument();
    });
    expect(screen.getByText(PIN_TOAST)).toBeInTheDocument();
  });

  it("review-page delete navigates to the list with toast and no Undo", async () => {
    const navigate = vi.fn();
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/withdraw")) {
        return Promise.resolve(
          jsonResponse({
            request_id: "req-review",
            status: "withdrawn",
            already_withdrawn: false,
          }),
        );
      }
      if (url.includes("/req-review") && !url.includes("/withdraw")) {
        return Promise.resolve(
          jsonResponse({
            request_id: "req-review",
            requested_name: "Wall angels",
            exercise_note: null,
            status: "drafting",
            requested_by: "11111111-1111-4111-8111-111111111111",
            requested_by_email: "k@example.com",
            exercise_id: "ex-1",
            generation: {
              generation_in_progress: false,
              first_draft_complete: true,
            },
            draft: {
              exercise_version_id: "ver-1",
              version_number: 1,
              title: "Wall angels",
              description: "d",
              equipment: "e",
              starting_position: "s",
              steps: "st",
              common_mistakes: "c",
              regressions: "r",
              progressions: "p",
              precautions: "x",
              cue_stretching: null,
              cue_isometric: null,
              cue_concentric: null,
              cue_eccentric: null,
            },
          }),
        );
      }
      if (url.includes("/regeneration-quota")) {
        return Promise.resolve(jsonResponse({ remaining: 3, limitReached: false }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    const client = new ExerciseRequestsClient({ fetchFn });
    const mediaClient = new ExerciseMediaClient({
      fetchFn: vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("regeneration-quota")) {
          return Promise.resolve(jsonResponse({ remaining: 3, limitReached: false }));
        }
        return Promise.resolve(new Response("stub", { status: 200 }));
      }),
    });
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-review" }),
        ]}
      >
        <NavigationTestProviders>
          <ToastProvider>
            <ExerciseRequestsApiProvider client={client}>
              <ExerciseMediaApiProvider client={mediaClient}>
                <Routes>
                  <Route
                    path="/requests/:requestId"
                    element={<DraftReviewPage onRequestsChanged={navigate} />}
                  />
                  <Route
                    path={fillPhysioAppRoutePattern("requests")}
                    element={<div data-testid="requests-landed">landed</div>}
                  />
                </Routes>
              </ExerciseMediaApiProvider>
            </ExerciseRequestsApiProvider>
          </ToastProvider>
        </NavigationTestProviders>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_DRAFT })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_DRAFT }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(PIN_DIALOG_TITLE)).toBeInTheDocument();
    expect(within(dialog).getByText(PIN_DIALOG_NO_UNDO)).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("requests-landed")).toBeInTheDocument();
    });
    expect(screen.getByText(PIN_TOAST)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("shows D10 when withdraw fails with a server error", async () => {
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({ requests: [listItem()], in_progress_count: 1 }),
        );
      }
      if (url.includes("/withdraw")) {
        return Promise.resolve(jsonResponse({ error: "server_error" }, 500));
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_ROW }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(within(dialog).getByText(PIN_D10)).toBeInTheDocument();
    });
    expect(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    ).toBeEnabled();
  });

  it("maps request_not_deletable to D11 and removes Delete draft from the dialog", async () => {
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({ requests: [listItem()], in_progress_count: 1 }),
        );
      }
      if (url.includes("/withdraw")) {
        return Promise.resolve(
          jsonResponse(
            { error: "request_not_deletable", message: "Request not deletable" },
            409,
          ),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_ROW }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(within(dialog).getByText(PIN_D11)).toBeInTheDocument();
    });
    expect(
      within(dialog).queryByRole("button", { name: PIN_DELETE_DRAFT }),
    ).not.toBeInTheDocument();
  });

  it("maps draft_generation_in_progress to D7 and disables delete after a lock race", async () => {
    let generationRunning = false;
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/withdraw")) {
        generationRunning = true;
        return Promise.resolve(
          jsonResponse(
            {
              error: "draft_generation_in_progress",
              message: "Draft generation is in progress",
            },
            409,
          ),
        );
      }
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({
            requests: [
              listItem({ generation_in_progress: generationRunning, status: "open" }),
            ],
            in_progress_count: 1,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_ROW }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByText(PIN_DELETE_BLOCKED)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeDisabled();
    });
  });

  it("shows D12 only when draft review GET returns request_not_found", async () => {
    const getRequest = vi.fn().mockRejectedValue(
      new ExerciseRequestsRequestError("Request not found", {
        status: 404,
        error: "request_not_found",
      }),
    );
    const requestsClient = {
      getRequest,
      getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
      listInProgress: vi.fn().mockResolvedValue({ requests: [], in_progress_count: 0 }),
      listSimilar: vi
        .fn()
        .mockResolvedValue({ library_matches: [], drafts_in_progress: [] }),
    } as unknown as ExerciseRequestsClient;
    const libraryClient = {
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "ok",
        sections: { new_from_requests: [], pinned: [], recently_used_and_saved: [] },
      }),
      searchApproved: vi.fn().mockResolvedValue({
        exercises: [],
        next_cursor: null,
        search_link: null,
        total_count: 0,
      }),
    } as unknown as ExerciseLibraryClient;
    const programsClient = {
      listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
      listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ProgramsClient;
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-gone" }),
        ]}
      >
        <ToastProvider>
          <PhysioApp
            practitionerSessionClient={stubPractitionerSessionClient()}
            exerciseRequestsClient={requestsClient}
            exerciseLibraryClient={libraryClient}
            exerciseMediaClient={
              {
                getRegenerationQuota: vi.fn().mockResolvedValue({
                  remaining: 3,
                  limitReached: false,
                }),
              } as unknown as ExerciseMediaClient
            }
            programsClient={programsClient}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(getRequest).toHaveBeenCalled();
      expect(screen.getByText(PIN_D12)).toBeInTheDocument();
    });
    expect(screen.queryByText(PIN_DELETE_DRAFT)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: PIN_REQUESTS })).toHaveFocus();
    });
  });

  it("does not show D12 when draft review GET fails with 500", async () => {
    const getRequest = vi.fn().mockRejectedValue(
      new ExerciseRequestsRequestError("Server error", {
        status: 500,
        error: "server_error",
      }),
    );
    const requestsClient = {
      getRequest,
      getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
      listInProgress: vi.fn().mockResolvedValue({ requests: [], in_progress_count: 0 }),
      listSimilar: vi
        .fn()
        .mockResolvedValue({ library_matches: [], drafts_in_progress: [] }),
    } as unknown as ExerciseRequestsClient;
    const libraryClient = {
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "ok",
        sections: { new_from_requests: [], pinned: [], recently_used_and_saved: [] },
      }),
      searchApproved: vi.fn().mockResolvedValue({
        exercises: [],
        next_cursor: null,
        search_link: null,
        total_count: 0,
      }),
    } as unknown as ExerciseLibraryClient;
    const programsClient = {
      listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
      listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ProgramsClient;
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-500" }),
        ]}
      >
        <ToastProvider>
          <PhysioApp
            practitionerSessionClient={stubPractitionerSessionClient()}
            exerciseRequestsClient={requestsClient}
            exerciseLibraryClient={libraryClient}
            exerciseMediaClient={
              {
                getRegenerationQuota: vi.fn().mockResolvedValue({
                  remaining: 3,
                  limitReached: false,
                }),
              } as unknown as ExerciseMediaClient
            }
            programsClient={programsClient}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(getRequest).toHaveBeenCalled();
      expect(screen.getByText(DRAFT_ITEM_LOAD_TITLE)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: LOAD_TRY_AGAIN })).toBeInTheDocument();
    expect(screen.getByText(DRAFT_ITEM_LOAD_HINT)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: DRAFT_ITEM_LOAD_BACK }),
    ).toBeInTheDocument();
    expect(screen.queryByText(PIN_D12)).not.toBeInTheDocument();
  });

  it("clears D7 once generation_in_progress is false again", async () => {
    let generationRunning = false;
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/withdraw")) {
        generationRunning = true;
        return Promise.resolve(
          jsonResponse(
            {
              error: "draft_generation_in_progress",
              message: "Draft generation is in progress",
            },
            409,
          ),
        );
      }
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({
            requests: [
              listItem({
                generation_in_progress: generationRunning,
                status: "open",
              }),
            ],
            in_progress_count: 1,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_ROW }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(screen.getByText(PIN_DELETE_BLOCKED)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeDisabled();
    });
    generationRunning = false;
    fireEvent.focus(window);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeEnabled();
      expect(screen.queryByText(PIN_DELETE_BLOCKED)).not.toBeInTheDocument();
    });
  });

  it("after row delete focuses the next row review control without skipping a row", async () => {
    let rows = [
      listItem({ request_id: "r-b", requested_name: "Stuck B", status: "open" }),
      listItem({ request_id: "r-a", requested_name: "Row A", status: "drafting" }),
      listItem({ request_id: "r-d", requested_name: "Row D", status: "drafting" }),
      listItem({ request_id: "r-e", requested_name: "Row E", status: "drafting" }),
    ];
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/withdraw")) {
        rows = rows.filter((r) => r.request_id !== "r-a");
        return Promise.resolve(
          jsonResponse({
            request_id: "r-a",
            status: "withdrawn",
            already_withdrawn: false,
          }),
        );
      }
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({ requests: rows, in_progress_count: rows.length }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByText("Row A")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: deleteRowAria("Row A") }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(screen.queryByText("Row A")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("ex-requests-review-r-d")).toHaveFocus();
    });
  });

  it("after row delete focuses delete on the next row when it has no review link", async () => {
    let rows = [
      listItem({ request_id: "r-a", requested_name: "Row A", status: "drafting" }),
      listItem({ request_id: "r-open", requested_name: "Row open", status: "open" }),
    ];
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/withdraw")) {
        rows = rows.filter((r) => r.request_id !== "r-a");
        return Promise.resolve(
          jsonResponse({
            request_id: "r-a",
            status: "withdrawn",
            already_withdrawn: false,
          }),
        );
      }
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({ requests: rows, in_progress_count: rows.length }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByText("Row A")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: deleteRowAria("Row A") }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: deleteRowAria("Row open") }),
      ).toHaveFocus();
    });
  });

  it("after row delete focuses the row container when the next row has no enabled action", async () => {
    let rows = [
      listItem({ request_id: "r-a", requested_name: "Row A", status: "drafting" }),
      listItem({
        request_id: "r-run",
        requested_name: "Row running",
        status: "open",
        generation_in_progress: true,
      }),
    ];
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/withdraw")) {
        rows = rows.filter((r) => r.request_id !== "r-a");
        return Promise.resolve(
          jsonResponse({
            request_id: "r-a",
            status: "withdrawn",
            already_withdrawn: false,
          }),
        );
      }
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({ requests: rows, in_progress_count: rows.length }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByText("Row A")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: deleteRowAria("Row A") }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      const row = screen.getByLabelText(`Row running, ${AI_DRAFTING}`);
      expect(row).toHaveFocus();
    });
  });

  it("after deleting the last row focuses the previous row review control", async () => {
    let rows = [
      listItem({ request_id: "r-d", requested_name: "Row D", status: "drafting" }),
      listItem({ request_id: "r-e", requested_name: "Row E", status: "drafting" }),
    ];
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/withdraw")) {
        rows = rows.filter((r) => r.request_id !== "r-e");
        return Promise.resolve(
          jsonResponse({
            request_id: "r-e",
            status: "withdrawn",
            already_withdrawn: false,
          }),
        );
      }
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({ requests: rows, in_progress_count: rows.length }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByText("Row E")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: deleteRowAria("Row E") }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("ex-requests-review-r-d")).toHaveFocus();
    });
  });

  it("after deleting the only row focuses the list heading", async () => {
    let rows = [listItem({ request_id: "r-only", requested_name: "Only row" })];
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/withdraw")) {
        rows = [];
        return Promise.resolve(
          jsonResponse({
            request_id: "r-only",
            status: "withdrawn",
            already_withdrawn: false,
          }),
        );
      }
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({ requests: rows, in_progress_count: rows.length }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByText("Only row")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_ROW }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(screen.queryByText("Only row")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: REQUESTS_HEADING })).toHaveFocus();
    });
  });

  it("Cancel closes the dialog without calling withdraw", async () => {
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/in-progress")) {
        return Promise.resolve(
          jsonResponse({
            requests: [listItem()],
            in_progress_count: 1,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderList(new ExerciseRequestsClient({ fetchFn }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_ROW })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_ROW }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: PIN_CANCEL }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      fetchFn.mock.calls.some((call) => String(call[0]).includes("/withdraw")),
    ).toBe(false);
  });
});
