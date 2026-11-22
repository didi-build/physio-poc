/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { ensureMatchMediaStub } from "./setup.js";
import { resetSessionReadCacheForTests } from "../../src/ui/api/session-read-cache.js";
import { setExerciseRequestsClientForTests } from "../../src/ui/api/exercise-requests-client.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import { exerciseRequestWithdrawPath } from "../../src/exercise-requests-api-paths.js";
import { PhysioApp } from "../../src/ui/App.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";

const PIN_DELETE_ROW = "Delete Seated hamstring stretch";
const PIN_DELETE_DRAFT = "Delete draft";
const PIN_POST = "POST";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Delete draft through real ExerciseRequestsApiProvider", () => {
  beforeEach(() => {
    ensureMatchMediaStub();
    resetSessionReadCacheForTests();
    setExerciseRequestsClientForTests(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("confirming delete sends POST /withdraw and the row disappears", async () => {
    const calls: { method: string; url: string }[] = [];
    let listed = true;
    const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url });
      if (url.includes("/api/me/practitioner-session")) {
        return Promise.resolve(
          jsonResponse({
            practitioner_id: "11111111-1111-4111-8111-111111111111",
            display_name: "Coach",
          }),
        );
      }
      if (url.includes("/withdraw")) {
        listed = false;
        return Promise.resolve(
          jsonResponse({
            request_id: "req-int",
            status: "withdrawn",
            already_withdrawn: false,
          }),
        );
      }
      if (url.endsWith("/api/me/exercise-requests/in-progress")) {
        return Promise.resolve(
          jsonResponse({
            in_progress_count: listed ? 1 : 0,
            requests: listed
              ? [
                  {
                    request_id: "req-int",
                    requested_name: "Seated hamstring stretch",
                    exercise_note: null,
                    status: "drafting",
                    requested_by: "11111111-1111-4111-8111-111111111111",
                    requested_by_email: "k@example.com",
                    exercise_id: "ex-int",
                    draft_title: "Seated hamstring stretch",
                    updated_at: "2026-01-01T00:00:00.000Z",
                    generation_in_progress: false,
                  },
                ]
              : [],
          }),
        );
      }
      if (url.includes("/in-progress/count")) {
        return Promise.resolve(jsonResponse({ in_progress_count: listed ? 1 : 0 }));
      }
      if (url.startsWith("/api/me/exercise-library")) {
        return Promise.resolve(
          jsonResponse({
            list_state: "ok",
            sections: {
              new_from_requests: [],
              pinned: [],
              recently_used_and_saved: [],
            },
          }),
        );
      }
      if (url.startsWith("/api/me/exercise-requests/similar")) {
        return Promise.resolve(
          jsonResponse({ library_matches: [], drafts_in_progress: [] }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchFn);
    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("requests")]}>
        <PhysioApp practitionerSessionClient={stubPractitionerSessionClient()} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Seated hamstring stretch")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_ROW }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === PIN_POST &&
            c.url.includes(exerciseRequestWithdrawPath("req-int")),
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText("Seated hamstring stretch")).not.toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("review-page delete re-fetches in-progress list through the caching provider", async () => {
    const calls: string[] = [];
    let listed = true;
    const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/me/exercise-requests/in-progress") && method === "GET") {
        calls.push("list");
      }
      if (url.includes("/api/me/practitioner-session")) {
        return Promise.resolve(
          jsonResponse({
            practitioner_id: "11111111-1111-4111-8111-111111111111",
            display_name: "Coach",
          }),
        );
      }
      if (url.includes("/withdraw")) {
        listed = false;
        return Promise.resolve(
          jsonResponse({
            request_id: "req-review-int",
            status: "withdrawn",
            already_withdrawn: false,
          }),
        );
      }
      if (url.includes("/regeneration-quota")) {
        return Promise.resolve(jsonResponse({ remaining: 3, limitReached: false }));
      }
      if (url.includes("/req-review-int") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            request_id: "req-review-int",
            requested_name: "Review delete",
            exercise_note: null,
            status: "drafting",
            requested_by: "11111111-1111-4111-8111-111111111111",
            requested_by_email: "k@example.com",
            exercise_id: "ex-int",
            generation: {
              generation_in_progress: false,
              first_draft_complete: true,
            },
            draft: {
              exercise_version_id: "ver-int",
              version_number: 1,
              title: "Review delete",
              description: "d",
              equipment: "",
              starting_position: "s",
              steps: "st",
              common_mistakes: "",
              regressions: "",
              progressions: "",
              precautions: "",
              cue_stretching: null,
              cue_isometric: null,
              cue_concentric: null,
              cue_eccentric: null,
            },
          }),
        );
      }
      if (url.endsWith("/api/me/exercise-requests/in-progress")) {
        return Promise.resolve(
          jsonResponse({
            in_progress_count: listed ? 1 : 0,
            requests: listed
              ? [
                  {
                    request_id: "req-review-int",
                    requested_name: "Review delete",
                    exercise_note: null,
                    status: "drafting",
                    requested_by: "11111111-1111-4111-8111-111111111111",
                    requested_by_email: "k@example.com",
                    exercise_id: "ex-int",
                    draft_title: "Review delete",
                    updated_at: "2026-01-01T00:00:00.000Z",
                    generation_in_progress: false,
                  },
                ]
              : [],
          }),
        );
      }
      if (url.includes("/in-progress/count")) {
        return Promise.resolve(jsonResponse({ in_progress_count: listed ? 1 : 0 }));
      }
      if (url.startsWith("/api/me/exercise-library")) {
        return Promise.resolve(
          jsonResponse({
            list_state: "ok",
            sections: {
              new_from_requests: [],
              pinned: [],
              recently_used_and_saved: [],
            },
          }),
        );
      }
      if (url.startsWith("/api/me/exercise-requests/similar")) {
        return Promise.resolve(
          jsonResponse({ library_matches: [], drafts_in_progress: [] }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchFn);
    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("requests")]}>
        <PhysioApp practitionerSessionClient={stubPractitionerSessionClient()} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Review delete")).toBeInTheDocument();
    });
    const listCallsBefore = calls.filter((c) => c === "list").length;
    const reviewLink = screen.getByTestId("ex-requests-review-req-review-int");
    await userEvent.click(reviewLink);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: PIN_DELETE_DRAFT })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: PIN_DELETE_DRAFT }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: PIN_DELETE_DRAFT }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Requests and drafts" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Review delete")).not.toBeInTheDocument();
    });
    expect(calls.filter((c) => c === "list").length).toBeGreaterThan(listCallsBefore);
    vi.unstubAllGlobals();
  });
});
