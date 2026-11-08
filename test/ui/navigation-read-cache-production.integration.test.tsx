/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { ensureMatchMediaStub } from "./setup.js";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PhysioApp } from "../../src/ui/App.js";
import { EXERCISE_LIBRARY_MY_EXERCISES_PATH } from "../../src/exercise-library-api-paths.js";
import { PRACTITIONER_SESSION_API_PATH } from "../../src/practitioner-session-api-paths.js";
import {
  FAKE_UI_PRACTITIONER_ID,
  stubPractitionerSessionClient,
} from "./fake-practitioner-session-fixture.js";
import {
  buildSessionReadCacheKey,
  resetSessionReadCacheForTests,
  SessionReadCache,
} from "../../src/ui/api/session-read-cache.js";
import { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import type { FetchFn } from "../../src/ui/api/exercise-library-client.js";
import { wrapExerciseLibraryClientWithCacheInvalidation } from "../../src/ui/api/caching-exercise-library-client.js";
import { wrapExerciseRequestsClientWithCacheInvalidation } from "../../src/ui/api/caching-exercise-requests-client.js";
import type { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";

const emptyMyList = {
  list_state: "ok",
  sections: {
    new_from_requests: [],
    pinned: [],
    recently_used_and_saved: [],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("navigation read cache production wiring (DIDI-1185)", () => {
  beforeEach(() => {
    ensureMatchMediaStub();
    resetSessionReadCacheForTests();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ExerciseLibraryClient forwards abort signal on GET", async () => {
    let observed: AbortSignal | undefined;
    const fetchFn: FetchFn = (_input, init) => {
      observed = init?.signal ?? undefined;
      return Promise.resolve(jsonResponse(emptyMyList));
    };
    const client = new ExerciseLibraryClient({ fetchFn });
    const controller = new AbortController();
    await client.listMyExercises({}, { signal: controller.signal });
    expect(observed).toBe(controller.signal);
  });

  it("PhysioApp load + wrapped save invalidation causes exactly one additional my-exercises GET on remount", async () => {
    let myExercisesGetCount = 0;
    const fetchFn: FetchFn = (input, init) => {
      const url = String(input);
      if (url === PRACTITIONER_SESSION_API_PATH) {
        return Promise.resolve(
          jsonResponse({
            practitioner_id: FAKE_UI_PRACTITIONER_ID,
            display_name: "Test Coach",
          }),
        );
      }
      const listPath =
        url === EXERCISE_LIBRARY_MY_EXERCISES_PATH ||
        url.startsWith(`${EXERCISE_LIBRARY_MY_EXERCISES_PATH}?`);
      if ((!init?.method || init.method === "GET") && listPath) {
        myExercisesGetCount += 1;
        return Promise.resolve(jsonResponse(emptyMyList));
      }
      if (init?.method === "POST" && url.includes("/my-exercises/")) {
        return Promise.resolve(
          jsonResponse({ undo: { kind: "remove", exercise_id: "ex-1" } }),
        );
      }
      return Promise.resolve(jsonResponse({ in_progress_count: 0 }));
    };
    vi.stubGlobal("fetch", fetchFn);

    const view = render(
      <MemoryRouter initialEntries={["/exercises"]}>
        <PhysioApp practitionerSessionClient={stubPractitionerSessionClient()} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(myExercisesGetCount).toBe(1));

    const wrapped = wrapExerciseLibraryClientWithCacheInvalidation(
      new ExerciseLibraryClient({ fetchFn }),
    );
    await wrapped.saveToMyExercises("ex-1");

    view.unmount();
    render(
      <MemoryRouter initialEntries={["/exercises"]}>
        <PhysioApp practitionerSessionClient={stubPractitionerSessionClient()} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(myExercisesGetCount).toBe(2));
  });

  it("updateDraft on wrapped exercise-requests client does not clear exercise list cache", async () => {
    const cache = new SessionReadCache();
    const { setSessionReadCacheForTests } =
      await import("../../src/ui/api/session-read-cache.js");
    setSessionReadCacheForTests(cache);
    cache.bindSession("p1");
    const listKey = buildSessionReadCacheKey("p1", {
      resource: "exercises.my_list",
      q: "",
    });
    await cache.fetch(listKey, () => Promise.resolve(emptyMyList));
    const inner = {
      updateDraft: vi.fn().mockResolvedValue({ request_id: "r1" }),
    } as unknown as ExerciseRequestsClient;
    const wrapped = wrapExerciseRequestsClientWithCacheInvalidation(inner);
    await wrapped.updateDraft("r1", { title: "Heel slide" });
    expect(cache.peekSuccess(listKey)).not.toBeNull();
  });
});
