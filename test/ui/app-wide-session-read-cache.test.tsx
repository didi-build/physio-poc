/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import {
  buildSessionReadCacheKey,
  resetSessionReadCacheForTests,
  SessionReadCache,
  setSessionReadCacheForTests,
} from "../../src/ui/api/session-read-cache.js";
import {
  exerciseRequestsInProgressListKey,
  myDefaultsPageKey,
} from "../../src/ui/api/navigation-read-cache-keys.js";
import {
  ExerciseRequestsClient,
  type FetchFn,
} from "../../src/ui/api/exercise-requests-client.js";
import { wrapExerciseRequestsClientWithCacheInvalidation } from "../../src/ui/api/caching-exercise-requests-client.js";
import { wrapMyDefaultsClientWithCacheInvalidation } from "../../src/ui/api/caching-my-defaults-client.js";
import type { MyDefaultsClient } from "../../src/ui/api/my-defaults-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { REQUESTS_HEADING } from "../../src/ui/copy/exercise-requests.js";
import { MY_DEFAULTS_PAGE_TITLE as MD_TITLE } from "../../src/ui/copy/my-defaults.js";
import {
  FAKE_UI_PRACTITIONER_ID,
  stubPractitionerSessionClient,
} from "./fake-practitioner-session-fixture.js";
import { NAV_TAB_EXERCISES } from "../../src/ui/copy/nav.js";

const myDefaultsPage = {
  share_link_expiry: {
    global: { expiresIn: "one_year" as const },
    practitioner: null,
    effective: { expiresIn: "one_year" as const },
  },
  exercise_types: [],
};

afterEach(() => {
  cleanup();
  setSessionReadCacheForTests(null);
  vi.restoreAllMocks();
});

beforeEach(() => {
  resetSessionReadCacheForTests();
});

describe("app-wide session read cache (DIDI-1188)", () => {
  it("ExerciseRequestsClient forwards abort signal on GET", async () => {
    let observed: AbortSignal | undefined;
    const fetchFn = vi.fn((_input: RequestInfo, init?: RequestInit) => {
      observed = init?.signal ?? undefined;
      return Promise.resolve(
        new Response(JSON.stringify({ in_progress_count: 0 }), {
          headers: { "content-type": "application/json" },
        }),
      );
    });
    const client = new ExerciseRequestsClient({
      fetchFn: fetchFn as unknown as FetchFn,
    });
    const controller = new AbortController();
    await client.getInProgressCount({ signal: controller.signal });
    expect(observed).toBe(controller.signal);
  });

  it("updateDraft invalidates request reads but not exercise library list cache", async () => {
    const cache = new SessionReadCache();
    setSessionReadCacheForTests(cache);
    cache.bindSession("p1");
    const listKey = buildSessionReadCacheKey("p1", {
      resource: "exercise_library.page",
    });
    const requestListKey = exerciseRequestsInProgressListKey("p1");
    await cache.fetch(listKey, () => Promise.resolve({ ok: true }));
    await cache.fetch(requestListKey, () => Promise.resolve({ requests: [] }));

    const inner = {
      updateDraft: vi.fn().mockResolvedValue({ request_id: "r1" }),
    } as unknown as ExerciseRequestsClient;
    const wrapped = wrapExerciseRequestsClientWithCacheInvalidation(inner);
    await wrapped.updateDraft("r1", { title: "Heel slide" });
    expect(cache.peekSuccess(listKey)).not.toBeNull();
    expect(cache.peekSuccess(requestListKey)).toBeNull();
  });

  it("my defaults mutation invalidates page and program builder keys", async () => {
    const cache = new SessionReadCache();
    setSessionReadCacheForTests(cache);
    cache.bindSession("p1");
    const mdKey = myDefaultsPageKey("p1");
    const builderKey = buildSessionReadCacheKey("p1", {
      resource: "programs.builder_by_code",
      programCode: "pg-1",
    });
    await cache.fetch(mdKey, () => Promise.resolve(myDefaultsPage));
    await cache.fetch(builderKey, () => Promise.resolve({ rows: [] }));

    const inner = {
      upsertTypeDefault: vi.fn().mockResolvedValue({ type: "stretching" }),
    } as unknown as MyDefaultsClient;
    const wrapped = wrapMyDefaultsClientWithCacheInvalidation(inner);
    await wrapped.upsertTypeDefault("stretching", {
      sets: 3,
      reps: 10,
      hold_s: 30,
      rest_s: 30,
    });
    expect(cache.peekSuccess(mdKey)).toBeNull();
    expect(cache.peekSuccess(builderKey)).toBeNull();
  });

  it("revisit requests and my defaults without duplicate list GETs", async () => {
    const listInProgress = vi.fn().mockResolvedValue({
      in_progress_count: 1,
      requests: [
        {
          request_id: "req-1",
          requested_name: "Heel slide",
          exercise_note: null,
          status: "drafting",
          requested_by: FAKE_UI_PRACTITIONER_ID,
          requested_by_email: "x@example.com",
          exercise_id: "ex-1",
          draft_title: "Heel slide",
          updated_at: "2026-10-30T12:00:00.000Z",
        },
      ],
    });
    const getInProgressCount = vi.fn().mockResolvedValue({ in_progress_count: 1 });
    const getPage = vi.fn().mockResolvedValue(myDefaultsPage);
    const requestsClient = {
      listInProgress,
      getInProgressCount,
      listSimilar: vi.fn(),
      getRequest: vi.fn(),
      updateDraft: vi.fn(),
      submitRequest: vi.fn(),
      approveRequest: vi.fn(),
    } as unknown as ExerciseRequestsClient;
    const myDefaultsClient = {
      getPage,
      updateShareLinkExpiry: vi.fn(),
      upsertTypeDefault: vi.fn(),
      resetTypeDefault: vi.fn(),
    } as unknown as MyDefaultsClient;
    const programsClient = {
      listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
      listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ProgramsClient;

    render(
      <MemoryRouter initialEntries={["/requests"]}>
        <Routes>
          <Route
            path="/*"
            element={
              <PhysioApp
                practitionerSessionClient={stubPractitionerSessionClient()}
                exerciseRequestsClient={requestsClient}
                myDefaultsClient={myDefaultsClient}
                programsClient={programsClient}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(listInProgress.mock.calls.length).toBeGreaterThanOrEqual(1),
    );
    await waitFor(() =>
      expect(getInProgressCount.mock.calls.length).toBeGreaterThanOrEqual(1),
    );
    const warmListCalls = listInProgress.mock.calls.length;
    const warmCountCalls = getInProgressCount.mock.calls.length;

    const user = userEvent.setup();
    const account = screen.getAllByRole("button", { name: /Account menu/i })[0]!;
    await user.click(account);
    await user.click(screen.getByRole("menuitem", { name: /My defaults/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: MD_TITLE })).toBeVisible(),
    );
    expect(getPage).toHaveBeenCalledTimes(1);

    const mainNav = screen.getAllByRole("navigation", { name: "Main" })[0]!;
    await user.click(within(mainNav).getByRole("link", { name: NAV_TAB_EXERCISES }));
    await user.click(account);
    await user.click(screen.getByRole("menuitem", { name: /Requests/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: REQUESTS_HEADING })).toBeVisible(),
    );

    await user.click(account);
    await user.click(screen.getByRole("menuitem", { name: /My defaults/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: MD_TITLE })).toBeVisible(),
    );

    expect(listInProgress.mock.calls.length).toBe(warmListCalls);
    expect(getInProgressCount.mock.calls.length).toBe(warmCountCalls);
    expect(getPage.mock.calls.length).toBe(1);
  });

  it("window focus coalesces to one forced requests list and count refresh", async () => {
    const listInProgress = vi.fn().mockResolvedValue({
      in_progress_count: 0,
      requests: [],
    });
    const getInProgressCount = vi.fn().mockResolvedValue({ in_progress_count: 0 });
    const requestsClient = {
      listInProgress,
      getInProgressCount,
      listSimilar: vi.fn(),
      getRequest: vi.fn(),
      updateDraft: vi.fn(),
      submitRequest: vi.fn(),
      approveRequest: vi.fn(),
    } as unknown as ExerciseRequestsClient;

    render(
      <MemoryRouter initialEntries={["/requests"]}>
        <Routes>
          <Route
            path="/*"
            element={
              <PhysioApp
                practitionerSessionClient={stubPractitionerSessionClient()}
                exerciseRequestsClient={requestsClient}
                programsClient={
                  {
                    listPrograms: vi
                      .fn()
                      .mockResolvedValue({ items: [], matched_code: null }),
                    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
                  } as unknown as ProgramsClient
                }
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(listInProgress.mock.calls.length).toBeGreaterThanOrEqual(1),
    );
    await waitFor(() =>
      expect(getInProgressCount.mock.calls.length).toBeGreaterThanOrEqual(1),
    );
    const listBefore = listInProgress.mock.calls.length;
    const countBefore = getInProgressCount.mock.calls.length;

    window.dispatchEvent(new Event("focus"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(listInProgress.mock.calls.length).toBe(listBefore + 1));
    expect(getInProgressCount.mock.calls.length).toBe(countBefore + 1);
  });
});
