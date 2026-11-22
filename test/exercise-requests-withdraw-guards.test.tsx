/**
 * Guards for DIDI-1278 withdraw / delete-draft behavior (integration + UI).
 * @vitest-environment jsdom (focus + draft load cases)
 */
import "./ui/setup.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { handleRequest } from "../src/http/app.js";
import {
  exerciseRequestWithdrawPath,
  exerciseRequestsCollectionPath,
  exerciseRequestsInProgressPath,
} from "../src/exercise-requests-api-paths.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { REQUEST_WITHDRAWN_EVENT } from "../src/services/exercise-requests/request-withdrawn-log.js";
import {
  ExerciseRequestsClient,
  type FetchFn,
} from "../src/ui/api/exercise-requests-client.js";
import { focusAfterRequestsListDelete } from "../src/ui/exercise-requests/requests-list-delete-focus.js";
import {
  DRAFT_ITEM_LOAD_BACK,
  DRAFT_ITEM_LOAD_HINT,
  DRAFT_ITEM_LOAD_TITLE,
  LOAD_TRY_AGAIN,
} from "../src/ui/copy/shared-load-states.js";
import { fillPhysioAppRoutePattern } from "../src/app-routes.js";
import { PhysioApp } from "../src/ui/App.js";
import { ToastProvider } from "../src/ui/components/Toast.js";
import type { ExerciseLibraryClient } from "../src/ui/api/exercise-library-client.js";
import type { ProgramsClient } from "../src/ui/api/programs-client.js";
import { ExerciseMediaClient } from "../src/ui/api/exercise-media-client.js";
import {
  FAKE_UI_PRACTITIONER_ID,
  stubPractitionerSessionClient,
} from "./ui/fake-practitioner-session-fixture.js";

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

function deps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId,
      email: "coach@example.com",
      displayName: "Coach",
    },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      auth,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

describe("exercise request withdraw guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("M05: approved request with fresh lock returns request_not_deletable, not draft_generation_in_progress", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-app-lock"),
        "al@ex.com",
      );
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = id("req-app-lock");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id,
          draft_generation_locked_at, created_at, updated_at
        ) VALUES (?, 'Approved locked', NULL, ?, 'approved', NULL, ?, ?, ?)`,
        [requestId, practitioner, new Date().toISOString(), TS, TS],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "request_not_deletable",
      });
    } finally {
      storage.close();
    }
  });

  it("M06: idempotent re-withdraw does not issue extra withdraw UPDATE attempts", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-idem"),
        "idem@ex.com",
      );
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = id("req-idem");
      const updatedAt = "2026-10-30T12:00:00.000Z";
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, 'Gone', NULL, ?, 'withdrawn', NULL, ?, ?)`,
        [requestId, practitioner, TS, updatedAt],
      );
      let withdrawUpdateAttempts = 0;
      const originalRun = storage.run.bind(storage);
      vi.spyOn(storage, "run").mockImplementation(async (sql, bindings) => {
        if (
          sql.includes("SET status = 'withdrawn'") &&
          sql.includes("exercise_requests")
        ) {
          withdrawUpdateAttempts += 1;
        }
        return originalRun(sql, bindings);
      });

      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        already_withdrawn: true,
      });
      expect(withdrawUpdateAttempts).toBe(1);

      const row = await storage.first<{ updated_at: string }>(
        "SELECT updated_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.updated_at).toBe(updatedAt);
    } finally {
      storage.close();
    }
  });

  it("A03: physio_request_withdrawn log line has only the documented payload fields", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-a03"), "a03@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = id("req-a03");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, 'Audit', NULL, ?, 'open', NULL, ?, ?)`,
        [requestId, practitioner, TS, TS],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      const line = logSpy.mock.calls
        .map((c) => String(c[0]))
        .find((l) => l.includes(REQUEST_WITHDRAWN_EVENT));
      expect(line).toBeTruthy();
      const parsed = JSON.parse(line!) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(
        [
          "event",
          "practitioner_id",
          "previous_status",
          "request_id",
          "requester_practitioner_id",
        ].sort(),
      );
      expect(parsed.request_id).toBe(requestId);
    } finally {
      storage.close();
    }
  });

  it("M02: withdrawRequest POSTs to /withdraw and does not short-circuit locally", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => {
      return new Response(
        JSON.stringify({
          request_id: "req-m02",
          status: "withdrawn",
          already_withdrawn: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const client = new ExerciseRequestsClient({ fetchFn });
    await client.withdrawRequest("req-m02");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain("/withdraw");
    expect(init?.method).toBe("POST");
  });

  it("L1: draft review load failure shows the design load title (rendered)", async () => {
    const getRequest = vi.fn().mockRejectedValue(
      Object.assign(new Error("server"), {
        status: 500,
        detail: { error: "server_error" },
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
    const { render } = await import("@testing-library/react");
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-l1" }),
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
      expect(screen.getByText("Couldn't load this draft.")).toBeInTheDocument();
    });
    expect(screen.getByText(DRAFT_ITEM_LOAD_HINT)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: DRAFT_ITEM_LOAD_BACK }),
    ).toBeInTheDocument();
  });

  it("N16: physio_request_withdrawn log pins request_id to the withdrawn id", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-n16"), "n16@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = id("req-n16-pin");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, 'Pin', NULL, ?, 'open', NULL, ?, ?)`,
        [requestId, practitioner, TS, TS],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      const line = logSpy.mock.calls
        .map((c) => String(c[0]))
        .find((l) => l.includes(REQUEST_WITHDRAWN_EVENT));
      expect(line).toBeTruthy();
      const parsed = JSON.parse(line!) as { request_id: string };
      expect(parsed.request_id).toBe(requestId);
    } finally {
      storage.close();
    }
  });

  it("L2: draft review load failure shows the design hint (rendered)", async () => {
    const getRequest = vi.fn().mockRejectedValue(
      Object.assign(new Error("server"), {
        status: 500,
        detail: { error: "server_error" },
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
    const { render } = await import("@testing-library/react");
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-l2" }),
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
      expect(
        screen.getByText("Check your connection, then try again."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Check your connection, then try again.").textContent).toBe(
      "Check your connection, then try again.",
    );
  });

  it("L5: item-load error banner keeps role=alert (rendered)", async () => {
    const requestsClient = {
      getRequest: vi.fn().mockRejectedValue(
        Object.assign(new Error("server"), {
          status: 500,
          detail: { error: "server_error" },
        }),
      ),
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
    const { render } = await import("@testing-library/react");
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-l5" }),
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
      expect(screen.getByTestId("ex-review-item-load-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("ex-review-item-load-error")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("L6: item-load Try again uses the LOAD_TRY_AGAIN label (rendered)", async () => {
    const requestsClient = {
      getRequest: vi.fn().mockRejectedValue(
        Object.assign(new Error("server"), {
          status: 500,
          detail: { error: "server_error" },
        }),
      ),
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
    const { render } = await import("@testing-library/react");
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-l6" }),
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
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Try again" }).textContent).toBe(
      "Try again",
    );
  });

  it("L3: Try again on item-load error forces a detail refetch", async () => {
    const getRequest = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("server"), {
          status: 500,
          detail: { error: "server_error" },
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("server"), {
          status: 500,
          detail: { error: "server_error" },
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
    const user = userEvent.setup();
    const { render } = await import("@testing-library/react");
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-l3" }),
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
      expect(screen.getByRole("button", { name: LOAD_TRY_AGAIN })).toBeInTheDocument();
    });
    expect(getRequest).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: LOAD_TRY_AGAIN }));
    await waitFor(() => {
      expect(getRequest).toHaveBeenCalledTimes(2);
    });
  });

  it("L7: item-load Try again shows Trying again... while refetch is in flight", async () => {
    let release: (() => void) | undefined;
    const getRequest = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.reject(
          Object.assign(new Error("server"), {
            status: 500,
            detail: { error: "server_error" },
          }),
        ),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            release = () => {
              reject(
                Object.assign(new Error("server"), {
                  status: 500,
                  detail: { error: "server_error" },
                }),
              );
            };
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
    const user = userEvent.setup();
    const { render } = await import("@testing-library/react");
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-l7" }),
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
      expect(screen.getByRole("button", { name: LOAD_TRY_AGAIN })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: LOAD_TRY_AGAIN }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Trying again..." }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(DRAFT_ITEM_LOAD_TITLE)).toBeInTheDocument();
    expect(
      screen.queryByTestId("exercise-library-busy-skeleton"),
    ).not.toBeInTheDocument();
    release?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: LOAD_TRY_AGAIN })).toBeInTheDocument();
    });
  });

  it("item-load Try again success renders the draft after a failed load", async () => {
    const loadedView = {
      request_id: "req-retry-ok",
      requested_name: "Loaded draft",
      exercise_note: null,
      status: "drafting" as const,
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "k@example.com",
      exercise_id: "ex-1",
      generation: { generation_in_progress: false, first_draft_complete: true },
      draft: {
        exercise_version_id: "ver-1",
        version_number: 1,
        title: "Loaded draft",
        description: "Body",
        equipment: "",
        starting_position: "Stand",
        steps: "",
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
    const getRequest = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("server"), {
          status: 500,
          detail: { error: "server_error" },
        }),
      )
      .mockResolvedValueOnce(loadedView);
    const requestsClient = {
      getRequest,
      getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
      listInProgress: vi.fn().mockResolvedValue({ requests: [], in_progress_count: 0 }),
      listSimilar: vi
        .fn()
        .mockResolvedValue({ library_matches: [], drafts_in_progress: [] }),
      updateDraft: vi.fn(),
      approveRequest: vi.fn(),
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
    const user = userEvent.setup();
    const { render } = await import("@testing-library/react");
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-retry-ok" }),
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
                draftStillObjectUrl: vi.fn().mockResolvedValue(null),
              } as unknown as ExerciseMediaClient
            }
            programsClient={programsClient}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: LOAD_TRY_AGAIN })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: LOAD_TRY_AGAIN }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Loaded draft" })).toBeInTheDocument();
    });
  });

  it("item-load Try again failure keeps banner and refocuses Try again", async () => {
    const getRequest = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("server"), {
          status: 500,
          detail: { error: "server_error" },
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("server"), {
          status: 500,
          detail: { error: "server_error" },
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
    const user = userEvent.setup();
    const { render } = await import("@testing-library/react");
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-retry-fail" }),
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
      expect(screen.getByRole("button", { name: LOAD_TRY_AGAIN })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: LOAD_TRY_AGAIN }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: LOAD_TRY_AGAIN })).toHaveFocus();
    });
    expect(screen.getByText(DRAFT_ITEM_LOAD_TITLE)).toBeInTheDocument();
  });

  it("N5/F1: focusAfterRequestsListDelete focuses the row after the deleted index, not the first review link", () => {
    const listRoot = document.createElement("div");
    listRoot.innerHTML = `
      <article data-testid="ex-requests-row-focus">
        <a data-testid="ex-requests-review-row-0" href="#0">R0</a>
      </article>
      <article data-testid="ex-requests-row-focus">
        <a data-testid="ex-requests-review-row-1" href="#1">R1</a>
      </article>
      <article data-testid="ex-requests-row-focus">
        <a data-testid="ex-requests-review-row-2" href="#2">R2</a>
      </article>
    `;
    document.body.append(listRoot);
    const heading = document.createElement("h1");
    const row0Review = listRoot.querySelector<HTMLElement>(
      '[data-testid="ex-requests-review-row-0"]',
    )!;
    const row1Review = listRoot.querySelector<HTMLElement>(
      '[data-testid="ex-requests-review-row-1"]',
    )!;
    const focusRow0 = vi.spyOn(row0Review, "focus");
    const focusRow1 = vi.spyOn(row1Review, "focus");
    focusAfterRequestsListDelete({
      listRoot,
      heading,
      deletedIndex: 1,
    });
    expect(focusRow1).toHaveBeenCalled();
    expect(focusRow0).not.toHaveBeenCalled();
  });

  it("E1: withdraw keeps the request exercise_id on the row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-e1"), "e1@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Keep ex id",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      expect(created.status).toBe(200);
      const { request_id: rid } = (await created.json()) as { request_id: string };
      const { ExerciseRequestsService } =
        await import("../src/services/exercise-requests/exercise-requests-service.js");
      const { ExerciseMediaService } =
        await import("../src/services/exercise-media/exercise-media-service.js");
      const { FakeImageGeneration } =
        await import("../src/storage/adapters/memory/fake-image-generation.js");
      const { PrefixMediaStorage } =
        await import("../src/storage/adapters/memory/prefix-media-storage.js");
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T11:00:00.000Z",
      });
      const mediaService = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        new PrefixMediaStorage(new InMemoryObjectStorage()),
      );
      await service.generateRequest({
        practitionerId: practitioner,
        requestId: rid,
        mediaService,
      });
      const before = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [rid],
      );
      expect(before?.exercise_id).toBeTruthy();
      const exId = before!.exercise_id!;
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(rid), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      const after = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [rid],
      );
      expect(after?.exercise_id).toBe(exId);
    } finally {
      storage.close();
    }
  });

  it("5e: stored media is preserved after delete (withdraw)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-5e"), "5e@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Media keep guard",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: rid } = (await created.json()) as { request_id: string };
      const { ExerciseRequestsService } =
        await import("../src/services/exercise-requests/exercise-requests-service.js");
      const { ExerciseMediaService } =
        await import("../src/services/exercise-media/exercise-media-service.js");
      const { FakeImageGeneration } =
        await import("../src/storage/adapters/memory/fake-image-generation.js");
      const { PrefixMediaStorage } =
        await import("../src/storage/adapters/memory/prefix-media-storage.js");
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T11:00:00.000Z",
      });
      const mediaService = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        new PrefixMediaStorage(new InMemoryObjectStorage()),
      );
      await service.generateRequest({
        practitionerId: practitioner,
        requestId: rid,
        mediaService,
      });
      const beforeVersion = await storage.first<{
        id: string;
        media_set_id: string | null;
      }>(
        `SELECT ev.id, ev.media_set_id
         FROM exercise_versions ev
         JOIN exercise_requests er ON er.exercise_id = ev.exercise_id
         WHERE er.id = ? AND ev.status = 'draft'
         ORDER BY ev.version_number DESC LIMIT 1`,
        [rid],
      );
      expect(beforeVersion?.media_set_id).toBeTruthy();
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(rid), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      const afterVersion = await storage.first<{
        media_set_id: string | null;
        status: string;
      }>(`SELECT media_set_id, status FROM exercise_versions WHERE id = ?`, [
        beforeVersion!.id,
      ]);
      expect(afterVersion?.status).toBe("draft");
      expect(afterVersion?.media_set_id).toBe(beforeVersion?.media_set_id);
    } finally {
      storage.close();
    }
  });

  it("M5b: withdraw preserves exercise_media_sets file keys and stored draft objects", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-m5b"), "m5b@ex.com");
      const objectStorage = new InMemoryObjectStorage();
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "m5b@ex.com",
          displayName: "M5b",
        },
      });
      const bundle = {
        sql: storage,
        objects: objectStorage,
        config: MCP_TEST_CONFIG,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        auth,
      };
      const cookie = auth.createSessionCookieHeader();
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "M5b media keys guard",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      expect(created.status).toBe(200);
      const { request_id: rid } = (await created.json()) as { request_id: string };
      const { ExerciseRequestsService } =
        await import("../src/services/exercise-requests/exercise-requests-service.js");
      const { ExerciseMediaService } =
        await import("../src/services/exercise-media/exercise-media-service.js");
      const { FakeImageGeneration } =
        await import("../src/storage/adapters/memory/fake-image-generation.js");
      const { PrefixMediaStorage } =
        await import("../src/storage/adapters/memory/prefix-media-storage.js");
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T11:00:00.000Z",
      });
      const mediaStorage = new PrefixMediaStorage(objectStorage);
      const mediaService = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        mediaStorage,
      );
      await service.generateRequest({
        practitionerId: practitioner,
        requestId: rid,
        mediaService,
      });
      const mediaSetId = await storage.first<{ media_set_id: string }>(
        `SELECT ev.media_set_id AS media_set_id
         FROM exercise_versions ev
         JOIN exercise_requests er ON er.exercise_id = ev.exercise_id
         WHERE er.id = ? AND ev.status = 'draft'
         ORDER BY ev.version_number DESC LIMIT 1`,
        [rid],
      );
      expect(mediaSetId?.media_set_id).toBeTruthy();
      const setId = mediaSetId!.media_set_id;

      const readMediaSnapshot = async () => {
        const row = await storage.first<{
          id: string;
          start_object_key: string;
          end_object_key: string;
          start_provider_url: string | null;
          visibility: string;
          created_at: string;
        }>(
          `SELECT id, start_object_key, end_object_key, start_provider_url, visibility, created_at
           FROM exercise_media_sets WHERE id = ?`,
          [setId],
        );
        expect(row).toBeTruthy();
        const startStored = await mediaStorage.getImage(row!.start_object_key, "draft");
        const endStored = await mediaStorage.getImage(row!.end_object_key, "draft");
        expect(startStored).toBeTruthy();
        expect(endStored).toBeTruthy();
        return {
          row: row!,
          startStored: {
            contentType: startStored!.contentType,
            body: startStored!.body,
          },
          endStored: {
            contentType: endStored!.contentType,
            body: endStored!.body,
          },
        };
      };

      const before = await readMediaSnapshot();
      expect(before.row.visibility).toBe("draft");
      expect(before.startStored.contentType).toBe("image/png");
      expect(before.endStored.contentType).toBe("image/png");

      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(rid), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        request_id: string;
        status: string;
        already_withdrawn: boolean;
      };
      expect(body).toEqual({
        request_id: rid,
        status: "withdrawn",
        already_withdrawn: false,
      });

      const after = await readMediaSnapshot();
      expect(after.row).toEqual(before.row);
      expect(after.startStored).toEqual(before.startStored);
      expect(after.endStored).toEqual(before.endStored);
      const rowExists = await storage.first<{ id: string }>(
        "SELECT id FROM exercise_media_sets WHERE id = ?",
        [setId],
      );
      expect(rowExists).toEqual({ id: setId });
    } finally {
      storage.close();
    }
  });

  it("S14: in-progress list reports generation_in_progress from lock freshness", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-s14"), "s14@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const openId = id("req-open-s14");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id,
          draft_generation_locked_at, created_at, updated_at
        ) VALUES (?, 'Lock', NULL, ?, 'open', NULL, ?, ?, ?)`,
        [openId, practitioner, new Date().toISOString(), TS, TS],
      );
      const list = await handleRequest(
        new Request(`${BASE}${exerciseRequestsInProgressPath()}`, {
          headers: { cookie },
        }),
        bundle,
      );
      expect(list.status).toBe(200);
      const body = (await list.json()) as {
        requests: { request_id: string; generation_in_progress: boolean }[];
      };
      const row = body.requests.find((r) => r.request_id === openId);
      expect(row?.generation_in_progress).toBe(true);
    } finally {
      storage.close();
    }
  });
});
