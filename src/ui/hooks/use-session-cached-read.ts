import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionReadCacheKey } from "../api/session-read-cache.js";
import { getSessionReadCache } from "../api/session-read-cache.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";

export type UseSessionCachedReadOptions<T> = {
  cacheKey: SessionReadCacheKey | null;
  enabled?: boolean;
  fetcher: () => Promise<T>;
  /** When true, keep showing last good data on error instead of clearing. */
  retainOnError?: boolean;
};

export type UseSessionCachedReadResult<T> = {
  data: T | null;
  loading: boolean;
  loadFailed: boolean;
  refresh: (options?: { force?: boolean }) => Promise<void>;
};

export function useSessionCachedRead<T>(
  options: UseSessionCachedReadOptions<T>,
): UseSessionCachedReadResult<T> {
  const { cacheKey, enabled = true, fetcher, retainOnError = true } = options;
  const sessionEpoch = useSessionReadCacheEpoch();
  const cache = getSessionReadCache();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const canUseCache = Boolean(cacheKey && sessionEpoch);

  const initialHit =
    enabled && cacheKey ? (cache.peekSuccess<T>(cacheKey)?.data ?? null) : null;

  const [data, setData] = useState<T | null>(initialHit);
  const [loading, setLoading] = useState(enabled && initialHit === null);
  const [loadFailed, setLoadFailed] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(
    async (refreshOptions?: { force?: boolean }) => {
      if (!enabled) {
        return;
      }
      const requestId = (requestIdRef.current += 1);
      const force = refreshOptions?.force === true;

      if (!canUseCache) {
        if (!cacheKey) {
          setLoading(true);
          setLoadFailed(false);
          try {
            const next = await fetcherRef.current();
            if (requestId !== requestIdRef.current) {
              return;
            }
            setData(next);
            setLoadFailed(false);
          } catch {
            if (requestId !== requestIdRef.current) {
              return;
            }
            if (!retainOnError) {
              setData(null);
            }
            setLoadFailed(true);
          } finally {
            if (requestId === requestIdRef.current) {
              setLoading(false);
            }
          }
        }
        return;
      }

      const cached = cache.peekSuccess<T>(cacheKey!);
      if (!cached || force) {
        if (!cached) {
          setLoading(true);
        }
        setLoadFailed(false);
      }
      const result = await cache.fetch(cacheKey!, () => fetcherRef.current(), {
        force,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (result.status === "ok") {
        setData(result.data);
        setLoadFailed(false);
        setLoading(false);
        return;
      }
      if (!retainOnError || !cached) {
        setData(null);
      }
      setLoadFailed(true);
      setLoading(false);
    },
    [cache, cacheKey, canUseCache, enabled, retainOnError],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    if (!enabled) {
      setLoading(true);
      return;
    }
    if (!cacheKey) {
      setLoading(true);
      return;
    }
    if (!canUseCache) {
      const cached = cache.peekSuccess<T>(cacheKey);
      if (cached) {
        setData(cached.data);
        setLoading(false);
        setLoadFailed(false);
      } else {
        setLoading(true);
      }
      return;
    }
    const cached = cache.peekSuccess<T>(cacheKey);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      setLoadFailed(false);
      return;
    }
    setData(null);
    void refresh();
  }, [cache, cacheKey, canUseCache, enabled, refresh]);

  return { data, loading, loadFailed, refresh };
}
