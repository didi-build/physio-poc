/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { ensureMatchMediaStub } from "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  fillPhysioAppRoutePattern,
  physioAppExerciseSearchPath,
} from "../../src/app-routes.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestRegenerateTextPath,
} from "../../src/exercise-requests-api-paths.js";
import { EXERCISE_MEDIA_REGENERATION_QUOTA_PATH } from "../../src/exercise-media-api-paths.js";
import { PRACTITIONER_SESSION_API_PATH } from "../../src/practitioner-session-api-paths.js";
import { EXERCISE_LIBRARY_MY_EXERCISES_PATH } from "../../src/exercise-library-api-paths.js";
import { PhysioApp } from "../../src/ui/App.js";
import { wrapExerciseRequestsClientWithCacheInvalidation } from "../../src/ui/api/caching-exercise-requests-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import { setExerciseMediaClientForTests } from "../../src/ui/api/exercise-media-client.js";
import { VIEW_REQUEST } from "../../src/ui/copy/exercise-requests.js";
import { SUBMIT_REQUEST } from "../../src/ui/copy/exercise-library.js";
import {
  FAKE_UI_PRACTITIONER_ID,
  stubPractitionerSessionClient,
} from "./fake-practitioner-session-fixture.js";
const PIN_GENERATE_POST = "POST";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installProdFetchStub() {
  const calls: { method: string; url: string }[] = [];
  const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });
    if (url === PRACTITIONER_SESSION_API_PATH) {
      return Promise.resolve(
        jsonResponse({
          practitioner_id: FAKE_UI_PRACTITIONER_ID,
          display_name: "Test Coach",
        }),
      );
    }
    if (
      url === EXERCISE_LIBRARY_MY_EXERCISES_PATH ||
      url.startsWith(`${EXERCISE_LIBRARY_MY_EXERCISES_PATH}?`)
    ) {
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
    if (url.includes("/api/me/exercise-requests/in-progress/count")) {
      return Promise.resolve(jsonResponse({ in_progress_count: 0 }));
    }
    if (url === "/api/me/exercise-requests") {
      return Promise.resolve(
        jsonResponse({
          outcome: "created",
          request_id: "req-prod-shaped",
          status: "drafting",
          exercise_id: null,
        }),
      );
    }
    if (url.endsWith("/api/me/exercise-requests/in-progress")) {
      return Promise.resolve(jsonResponse({ requests: [], in_progress_count: 0 }));
    }
    if (
      url.includes("/api/me/exercise-requests/req-prod-shaped") &&
      !url.includes("/generate") &&
      method === "GET"
    ) {
      return Promise.resolve(
        jsonResponse({
          request_id: "req-prod-shaped",
          requested_name: "Sumo squat",
          exercise_note: null,
          status: "drafting",
          requested_by: FAKE_UI_PRACTITIONER_ID,
          requested_by_email: "k@example.com",
          exercise_id: null,
          generation: { generation_in_progress: false, first_draft_complete: false },
          draft: null,
        }),
      );
    }
    if (url.includes("/api/me/exercise-requests/req-prod-shaped/generate")) {
      return Promise.resolve(
        jsonResponse({
          outcome: "in_progress",
          started_elsewhere: false,
          view: null,
        }),
      );
    }
    if (
      url.includes("/api/me/exercise-requests/req-shaped-review") &&
      !url.includes("/generate") &&
      method === "GET"
    ) {
      return Promise.resolve(
        jsonResponse({
          request_id: "req-shaped-review",
          requested_name: "Sumo squat",
          exercise_note: null,
          status: "drafting",
          requested_by: FAKE_UI_PRACTITIONER_ID,
          requested_by_email: "k@example.com",
          exercise_id: null,
          generation: { generation_in_progress: false, first_draft_complete: false },
          draft: null,
        }),
      );
    }
    if (url.includes("/api/me/exercise-requests/req-shaped-review/generate")) {
      return Promise.resolve(
        jsonResponse({
          outcome: "complete",
          view: {
            request_id: "req-shaped-review",
            requested_name: "Sumo squat",
            exercise_note: null,
            status: "drafting",
            requested_by: FAKE_UI_PRACTITIONER_ID,
            requested_by_email: "k@example.com",
            exercise_id: "ex-1",
            generation: { generation_in_progress: false, first_draft_complete: true },
            draft: {
              exercise_version_id: "ver-1",
              version_number: 1,
              title: "Sumo squat",
              description: "Filled",
              equipment: "",
              starting_position: "Stand",
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
          },
        }),
      );
    }
    if (url === EXERCISE_MEDIA_REGENERATION_QUOTA_PATH) {
      return Promise.resolve(
        jsonResponse({ limit: 5, used: 0, remaining: 5, limitReached: false }),
      );
    }
    if (url.includes("/regenerate-text")) {
      return Promise.resolve(jsonResponse({ outcome: "complete", view: {} }));
    }
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal("fetch", fetchFn);
  return { calls, fetchFn };
}

afterEach(() => {
  cleanup();
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DIDI-1275/1276 prod-shaped ExerciseRequests provider", () => {
  beforeEach(() => {
    ensureMatchMediaStub();
  });
  it("wrapExerciseRequestsClientWithCacheInvalidation forwards generateRequest (regression guard for ac823b3)", () => {
    const inner = new ExerciseRequestsClient({
      fetchFn: vi.fn().mockResolvedValue(jsonResponse({})),
    });
    const wrapped = wrapExerciseRequestsClientWithCacheInvalidation(inner);
    expect(typeof wrapped.generateRequest).toBe("function");
    expect(typeof wrapped.regenerateDraftText).toBe("function");
    expect(typeof wrapped.withdrawRequest).toBe("function");
  });

  it("submit then View request sends POST /generate through the wrapped default client", async () => {
    const { calls } = installProdFetchStub();
    render(
      <MemoryRouter initialEntries={[physioAppExerciseSearchPath("Sumo squat")]}>
        <PhysioApp practitionerSessionClient={stubPractitionerSessionClient()} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: SUBMIT_REQUEST })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: SUBMIT_REQUEST }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: VIEW_REQUEST })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: VIEW_REQUEST }));
    await waitFor(() => {
      const generateCalls = calls.filter(
        (c) =>
          c.method === PIN_GENERATE_POST &&
          c.url.includes(exerciseRequestGeneratePath("req-prod-shaped")),
      );
      expect(generateCalls).toHaveLength(1);
    });
  });

  it("draft review open through wrapped client sends POST /generate on mount", async () => {
    const { calls } = installProdFetchStub();
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", {
            requestId: "req-shaped-review",
          }),
        ]}
      >
        <PhysioApp practitionerSessionClient={stubPractitionerSessionClient()} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const generateCalls = calls.filter(
        (c) =>
          c.method === PIN_GENERATE_POST &&
          c.url.includes(exerciseRequestGeneratePath("req-shaped-review")),
      );
      expect(generateCalls).toHaveLength(1);
    });
  });

  it("wrapped default client regenerateDraftText sends POST /regenerate-text", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ outcome: "complete", view: { request_id: "req-1" } }),
      );
    const wrapped = wrapExerciseRequestsClientWithCacheInvalidation(
      new ExerciseRequestsClient({ fetchFn }),
    );
    await wrapped.regenerateDraftText("req-1", null);
    expect(fetchFn).toHaveBeenCalledWith(
      exerciseRequestRegenerateTextPath("req-1"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
