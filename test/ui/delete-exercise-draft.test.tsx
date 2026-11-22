/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import type { InProgressRequestListItem } from "../../src/services/exercise-requests/types.js";
import { ExerciseRequestsApiProvider } from "../../src/ui/api/exercise-requests-context.js";
import { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";
import { ToastProvider } from "../../src/ui/components/Toast.js";
import { DraftReviewPage } from "../../src/ui/exercise-requests/DraftReviewPage.js";
import { RequestsAndDraftsPage } from "../../src/ui/exercise-requests/RequestsAndDraftsPage.js";
import { NavigationTestProviders } from "./navigation-test-providers.js";
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
