import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SessionReadCacheConsumerLease,
  SessionReadCacheKey,
} from "../api/session-read-cache.js";
import { getSessionReadCache } from "../api/session-read-cache.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";

export type UseSessionCachedReadOptions<T> = {
  cacheKey: SessionReadCacheKey | null;
  enabled?: boolean;
  fetcher: (signal?: AbortSignal) => Promise<T>;
  /** When true, keep showing last good data on error instead of clearing. */
  retainOnError?: boolean;
};

export type UseSessionCachedReadResult<T> = {
  data: T | null;
  loading: boolean;
  loadFailed: boolean;
  refresh: (options?: { force?: boolean }) => Promise<void>;
};

const MAX_SUPERSEDED_RETRIES = 4;

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
  const activeLeaseRef = useRef<SessionReadCacheConsumerLease | null>(null);

  const releaseActiveLease = useCallback(() => {
    const lease = activeLeaseRef.current;
    if (lease) {
      cache.releaseConsumer(lease);
      activeLeaseRef.current = null;
    }
  }, [cache]);

  const refresh = useCallback(
    async (refreshOptions?: { force?: boolean }) => {
      if (!enabled) {
        return;
      }
      const requestId = (requestIdRef.current += 1);
      const force = refreshOptions?.force === true;
      const epochAtStart = sessionEpoch;
      const sessionGenerationAtStart = cache.getSessionGeneration();

      const isDisposed = () =>
        requestId !== requestIdRef.current ||
        sessionEpoch !== epochAtStart ||
        cache.getSessionGeneration() !== sessionGenerationAtStart;

      if (!canUseCache) {
        if (!cacheKey) {
          setLoading(true);
          setLoadFailed(false);
          try {
            const next = await fetcherRef.current(new AbortController().signal);
            if (isDisposed()) {
              return;
            }
            setData(next);
            setLoadFailed(false);
          } catch {
            if (isDisposed()) {
              return;
            }
            if (!retainOnError) {
              setData(null);
            }
            setLoadFailed(true);
          } finally {
            if (!isDisposed()) {
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

      let supersededRetries = 0;
      while (supersededRetries <= MAX_SUPERSEDED_RETRIES) {
        if (isDisposed()) {
          releaseActiveLease();
          return;
        }

        let consumerLease: SessionReadCacheConsumerLease | undefined;
        try {
          const result = await cache.fetch(
            cacheKey!,
            (signal) => fetcherRef.current(signal),
            {
              force: force && supersededRetries === 0,
              registerConsumer: (lease: SessionReadCacheConsumerLease) => {
                consumerLease = lease;
                activeLeaseRef.current = lease;
              },
            },
          );
          if (isDisposed()) {
            return;
          }
          if (result.status === "ok") {
            setData(result.data);
            setLoadFailed(false);
            setLoading(false);
            return;
          }
          if (result.status === "superseded") {
            supersededRetries += 1;
            if (isDisposed()) {
              return;
            }
            const retryHit = cache.peekSuccess<T>(cacheKey!);
            if (retryHit) {
              setData(retryHit.data);
              setLoadFailed(false);
              setLoading(false);
              return;
            }
            continue;
          }
          if (!retainOnError || !cached) {
            setData(null);
          }
          setLoadFailed(true);
          setLoading(false);
          return;
        } finally {
          if (consumerLease) {
            cache.releaseConsumer(consumerLease);
            const active = activeLeaseRef.current;
            if (
              active &&
              active.inFlightId === consumerLease.inFlightId &&
              active.token === consumerLease.token
            ) {
              activeLeaseRef.current = null;
            }
          }
        }
      }
      if (isDisposed()) {
        return;
      }
      const finalHit = cache.peekSuccess<T>(cacheKey!);
      if (finalHit) {
        setData(finalHit.data);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
      setLoading(false);
    },
    [
      cache,
      cacheKey,
      canUseCache,
      enabled,
      releaseActiveLease,
      retainOnError,
      sessionEpoch,
    ],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    releaseActiveLease();
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
  }, [cache, cacheKey, canUseCache, enabled, refresh, releaseActiveLease]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      releaseActiveLease();
    };
  }, [releaseActiveLease]);

  return { data, loading, loadFailed, refresh };
}
