/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSessionReadCacheKey,
  getSessionReadCache,
  SessionReadCache,
} from "../../src/ui/api/session-read-cache.js";
import {
  invalidateAfterExerciseLibraryMutation,
  invalidateAfterProgramsListMutation,
} from "../../src/ui/api/navigation-read-cache-invalidation.js";
import { renderHook, waitFor } from "@testing-library/react";
import { useSessionCachedRead } from "../../src/ui/hooks/use-session-cached-read.js";
import React from "react";
import { SessionReadCacheProvider } from "../../src/ui/api/session-read-cache-context.js";
import { PractitionerSessionProvider } from "../../src/ui/api/practitioner-session-context.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";

describe("SessionReadCache", () => {
  let cache: SessionReadCache;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dedupes identical in-flight reads", async () => {
    cache = new SessionReadCache();
    cache.bindSession("practitioner-a");
    const key = buildSessionReadCacheKey("practitioner-a", {
      resource: "test",
      id: 1,
    });
    const loader = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 20)),
      );

    const [a, b] = await Promise.all([
      cache.fetch(key, loader),
      cache.fetch(key, loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
  });

  it("returns cached hits without calling the loader again", async () => {
    cache = new SessionReadCache({ maxEntries: 4 });
    cache.bindSession("practitioner-a");
    const key = buildSessionReadCacheKey("practitioner-a", { resource: "test" });
    const loader = vi.fn().mockResolvedValue("payload");

    await cache.fetch(key, loader);
    const hit = await cache.fetch(key, loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(hit.fromCache).toBe(true);
    expect(hit.status).toBe("ok");
    if (hit.status === "ok") {
      expect(hit.data).toBe("payload");
    }
  });

  it("isolates entries by session epoch", async () => {
    cache = new SessionReadCache();
    cache.bindSession("practitioner-a");
    const keyA = buildSessionReadCacheKey("practitioner-a", { resource: "test" });
    await cache.fetch(keyA, () => Promise.resolve("a"));

    cache.bindSession("practitioner-b");
    const keyB = buildSessionReadCacheKey("practitioner-b", { resource: "test" });
    expect(cache.peekSuccess(keyB)).toBeNull();
    await cache.fetch(keyB, () => Promise.resolve("b"));
    expect(cache.peekSuccess(keyB)?.data).toBe("b");
  });

  it("evicts oldest entries when over capacity", async () => {
    cache = new SessionReadCache({ maxEntries: 2 });
    cache.bindSession("p1");
    const k1 = buildSessionReadCacheKey("p1", { resource: "r", n: 1 });
    const k2 = buildSessionReadCacheKey("p1", { resource: "r", n: 2 });
    const k3 = buildSessionReadCacheKey("p1", { resource: "r", n: 3 });
    await cache.fetch(k1, () => Promise.resolve(1));
    await cache.fetch(k2, () => Promise.resolve(2));
    await cache.fetch(k3, () => Promise.resolve(3));

    expect(cache.peekSuccess(k1)).toBeNull();
    expect(cache.peekSuccess(k2)?.data).toBe(2);
    expect(cache.peekSuccess(k3)?.data).toBe(3);
  });

  it("does not store failures and allows retry", async () => {
    cache = new SessionReadCache();
    cache.bindSession("p1");
    const key = buildSessionReadCacheKey("p1", { resource: "fail" });
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("ok");

    const first = await cache.fetch(key, loader);
    expect(first.status).toBe("error");
    expect(cache.peekSuccess(key)).toBeNull();

    const second = await cache.fetch(key, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(second.status).toBe("ok");
  });
});

describe("navigation cache invalidation", () => {
  it("drops exercise list and detail keys on library mutation", () => {
    const cache = new SessionReadCache();
    cache.bindSession("p1");
    const listKey = buildSessionReadCacheKey("p1", {
      resource: "exercises.my_list",
      q: "",
    });
    const detailKey = buildSessionReadCacheKey("p1", {
      resource: "exercises.detail",
      exerciseId: "ex-1",
    });
    void cache.fetch(listKey, () => Promise.resolve({ items: [] }));
    void cache.fetch(detailKey, () => Promise.resolve({ id: "ex-1" }));

    invalidateAfterExerciseLibraryMutation("ex-1");

    expect(cache.peekSuccess(listKey)).toBeNull();
    expect(cache.peekSuccess(detailKey)).toBeNull();
  });

  it("drops programs page snapshot on list mutation", () => {
    const cache = new SessionReadCache();
    cache.bindSession("p1");
    const key = buildSessionReadCacheKey("p1", { resource: "programs.page", q: "" });
    void cache.fetch(key, () => Promise.resolve({ items: [] }));

    invalidateAfterProgramsListMutation();
    expect(cache.peekSuccess(key)).toBeNull();
  });
});

describe("useSessionCachedRead", () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <PractitionerSessionProvider client={stubPractitionerSessionClient()}>
        <SessionReadCacheProvider>{children}</SessionReadCacheProvider>
      </PractitionerSessionProvider>
    );
  }

  it("does not refetch on mount when a valid entry exists", async () => {
    const fetcher = vi.fn().mockResolvedValue({ label: "cached" });
    const epoch = "00000000-0000-4000-8000-000000000099";
    const key = buildSessionReadCacheKey(epoch, {
      resource: "hook.test",
    });
    const cache = getSessionReadCache();
    cache.bindSession(epoch);
    await cache.fetch(key, () => Promise.resolve({ label: "cached" }));

    const first = renderHook(
      () =>
        useSessionCachedRead({
          cacheKey: key,
          fetcher,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(first.result.current.data).toEqual({ label: "cached" });
    });
    expect(fetcher).not.toHaveBeenCalled();
    first.unmount();

    const second = renderHook(
      () =>
        useSessionCachedRead({
          cacheKey: key,
          fetcher,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(second.result.current.data).toEqual({ label: "cached" });
    });
    expect(second.result.current.loading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
