/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
