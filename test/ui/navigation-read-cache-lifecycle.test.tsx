/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSessionReadCacheKey,
  SessionReadCache,
  estimateSessionReadCachePayloadBytes,
} from "../../src/ui/api/session-read-cache.js";
import { invalidateAfterExerciseLibraryMutation } from "../../src/ui/api/navigation-read-cache-invalidation.js";
import { wrapExerciseLibraryClientWithCacheInvalidation } from "../../src/ui/api/caching-exercise-library-client.js";
import { wrapExerciseRequestsClientWithCacheInvalidation } from "../../src/ui/api/caching-exercise-requests-client.js";
import type { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import type { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";
import { renderHook, waitFor } from "@testing-library/react";
import { useSessionCachedRead } from "../../src/ui/hooks/use-session-cached-read.js";
import React from "react";
import { SessionReadCacheProvider } from "../../src/ui/api/session-read-cache-context.js";
import { PractitionerSessionProvider } from "../../src/ui/api/practitioner-session-context.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";
import { setSessionReadCacheForTests } from "../../src/ui/api/session-read-cache.js";

describe("SessionReadCache superseded in-flight responses", () => {
  afterEach(() => {
    setSessionReadCacheForTests(null);
  });

  it("returns superseded (not error) when a successful GET is invalidated before commit", async () => {
    const cache = new SessionReadCache();
    setSessionReadCacheForTests(cache);
    cache.bindSession("p1");
    const key = buildSessionReadCacheKey("p1", {
      resource: "exercises.my_list",
      q: "",
    });
    let resolveLoad!: (value: string) => void;
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const inflight = cache.fetch(key, loader);
    invalidateAfterExerciseLibraryMutation();
    resolveLoad("late");

    const result = await inflight;
    expect(result.status).toBe("superseded");
    expect(cache.peekSuccess(key)).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("hook retries superseded fetch and does not set loadFailed", async () => {
    const cache = new SessionReadCache();
    setSessionReadCacheForTests(cache);
    cache.bindSession("00000000-0000-4000-8000-000000000099");
    const key = buildSessionReadCacheKey("00000000-0000-4000-8000-000000000099", {
      resource: "hook.race",
    });

    let call = 0;
    let unblockFirst!: (value: string) => void;
    const first = new Promise<string>((resolve) => {
      unblockFirst = resolve;
    });
    const fetcher = vi.fn(() => {
      call += 1;
      if (call === 1) {
        return first;
      }
      return Promise.resolve("fresh");
    });

    function wrapper({ children }: { children: React.ReactNode }) {
      return (
        <PractitionerSessionProvider client={stubPractitionerSessionClient()}>
          <SessionReadCacheProvider>{children}</SessionReadCacheProvider>
        </PractitionerSessionProvider>
      );
    }

    const { result } = renderHook(
      () =>
        useSessionCachedRead({
          cacheKey: key,
          fetcher,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
    cache.invalidate([key]);
    unblockFirst("stale-late");

    await waitFor(
      () => {
        expect(result.current.data).toBe("fresh");
      },
      { timeout: 3000 },
    );
    expect(result.current.loadFailed).toBe(false);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("SessionReadCache retained byte budget", () => {
  it("evicts oldest entries when total retained bytes exceed the cap", async () => {
    const cache = new SessionReadCache({
      maxEntries: 100,
      maxRetainedBytes: 500,
    });
    cache.bindSession("p1");
    const big = "x".repeat(200);
    const k1 = buildSessionReadCacheKey("p1", { resource: "b", n: 1 });
    const k2 = buildSessionReadCacheKey("p1", { resource: "b", n: 2 });
    const k3 = buildSessionReadCacheKey("p1", { resource: "b", n: 3 });
    await cache.fetch(k1, () => Promise.resolve(big));
    await cache.fetch(k2, () => Promise.resolve(big));
    await cache.fetch(k3, () => Promise.resolve(big));

    expect(estimateSessionReadCachePayloadBytes(big)).toBeGreaterThan(100);
    expect(cache.peekSuccess(k1)).toBeNull();
    expect(cache.peekSuccess(k3)?.data).toBe(big);
  });
});

describe("SessionReadCache in-flight cancellation", () => {
  it("aborts the loader when the sole consumer is released before completion", async () => {
    const cache = new SessionReadCache();
    cache.bindSession("p1");
    const key = buildSessionReadCacheKey("p1", { resource: "abort" });
    let aborted = false;
    const loader = (signal?: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        });
      });

    const inflight = cache.fetch(key, loader);
    cache.releaseInFlightConsumer(key);
    const result = await inflight;
    expect(aborted).toBe(true);
    expect(result.status === "superseded" || result.status === "error").toBe(true);
  });

  it("does not abort a shared in-flight read while a second consumer is active", async () => {
    const cache = new SessionReadCache();
    cache.bindSession("p1");
    const key = buildSessionReadCacheKey("p1", { resource: "shared" });
    let abortCount = 0;
    const loader = (signal?: AbortSignal) =>
      new Promise<string>((resolve) => {
        signal?.addEventListener("abort", () => {
          abortCount += 1;
        });
        setTimeout(() => resolve("ok"), 40);
      });

    const a = cache.fetch(key, loader);
    const b = cache.fetch(key, loader);
    cache.releaseInFlightConsumer(key);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.status).toBe("ok");
    expect(rb.status).toBe("ok");
    expect(abortCount).toBe(0);
  });
});

describe("cross-domain invalidation and production wrappers", () => {
  it("drops program builder cache keys on exercise library mutation", async () => {
    const cache = new SessionReadCache();
    setSessionReadCacheForTests(cache);
    cache.bindSession("p1");
    const builderKey = buildSessionReadCacheKey("p1", {
      resource: "programs.builder_by_code",
      programCode: "PRG-ABC",
    });
    await cache.fetch(builderKey, () => Promise.resolve({ code: "PRG-ABC" }));
    expect(cache.peekSuccess(builderKey)).not.toBeNull();

    invalidateAfterExerciseLibraryMutation();
    expect(cache.peekSuccess(builderKey)).toBeNull();
  });

  it("wrapExerciseLibraryClientWithCacheInvalidation invalidates list keys on save", async () => {
    const cache = new SessionReadCache();
    setSessionReadCacheForTests(cache);
    cache.bindSession("p1");
    const listKey = buildSessionReadCacheKey("p1", {
      resource: "exercises.my_list",
      q: "",
    });
    await cache.fetch(listKey, () => Promise.resolve({ sections: {} }));

    const inner: ExerciseLibraryClient = {
      searchApproved: async () => ({
        exercises: [],
        next_cursor: null,
        search_link: null,
        total_count: 0,
      }),
      listMyExercises: async () => ({
        list_state: "ok",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      }),
      getExerciseDetails: async () => {
        throw new Error("unused");
      },
      saveToMyExercises: async () => ({ kind: "saved" as const }),
    } as unknown as ExerciseLibraryClient;

    const wrapped = wrapExerciseLibraryClientWithCacheInvalidation(inner);
    await wrapped.saveToMyExercises("ex-1");
    expect(cache.peekSuccess(listKey)).toBeNull();
  });

  it("wrapExerciseRequestsClientWithCacheInvalidation invalidates on approve", async () => {
    const cache = new SessionReadCache();
    setSessionReadCacheForTests(cache);
    cache.bindSession("p1");
    const listKey = buildSessionReadCacheKey("p1", {
      resource: "exercise_library.page",
    });
    await cache.fetch(listKey, () => Promise.resolve({ tab: "mine" }));

    const inner = {
      listSimilar: async () => ({ items: [] }),
      listInProgress: async () => ({ items: [] }),
      getInProgressCount: async () => ({ in_progress_count: 0 }),
      getRequest: async () => {
        throw new Error("unused");
      },
      updateDraft: async () => {
        throw new Error("unused");
      },
      submitRequest: async () => ({ request_id: "r1", status: "drafting" as const }),
      approveRequest: async () => ({ exercise_id: "ex-1" }),
    } as unknown as ExerciseRequestsClient;

    const wrapped = wrapExerciseRequestsClientWithCacheInvalidation(inner);
    await wrapped.approveRequest("req-1");
    expect(cache.peekSuccess(listKey)).toBeNull();
  });
});
