import { useCallback, useEffect, useRef, useState } from "react";
import { isLoadNotFoundError } from "../shared-load-states/classify-load-error.js";
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

export type LoadFailureKind = "not_found" | "error" | null;

export type UseSessionCachedReadResult<T> = {
  data: T | null;
  loading: boolean;
  loadFailed: boolean;
  failureKind: LoadFailureKind;
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
  const [failureKind, setFailureKind] = useState<LoadFailureKind>(null);
  const requestIdRef = useRef(0);
  const activeLeaseRef = useRef<SessionReadCacheConsumerLease | null>(null);
  const lastFetchErrorRef = useRef<unknown>(null);

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
          setFailureKind(null);
          try {
            const next = await fetcherRef.current(new AbortController().signal);
            if (isDisposed()) {
              return;
            }
            setData(next);
            setLoadFailed(false);
            setFailureKind(null);
          } catch (error) {
            if (isDisposed()) {
              return;
            }
            if (!retainOnError) {
              setData(null);
            }
            setLoadFailed(true);
            setFailureKind(isLoadNotFoundError(error) ? "not_found" : "error");
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
        if (cached) {
          setLoadFailed(false);
          setFailureKind(null);
        }
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
            async (signal) => {
              try {
                return await fetcherRef.current(signal);
              } catch (error) {
                lastFetchErrorRef.current = error;
                throw error;
              }
            },
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
            setFailureKind(null);
            lastFetchErrorRef.current = null;
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
              setFailureKind(null);
              setLoading(false);
              return;
            }
            continue;
          }
          if (!retainOnError || !cached) {
            setData(null);
          }
          setLoadFailed(true);
          setFailureKind(
            isLoadNotFoundError(lastFetchErrorRef.current) ? "not_found" : "error",
          );
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
        setFailureKind(null);
      } else {
        setLoadFailed(true);
        setFailureKind(
          isLoadNotFoundError(lastFetchErrorRef.current) ? "not_found" : "error",
        );
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
      if (enabled) {
        void refresh();
      } else {
        setLoading(true);
      }
      return;
    }
    if (!canUseCache) {
      const cached = cache.peekSuccess<T>(cacheKey);
      if (cached) {
        setData(cached.data);
        setLoading(false);
        setLoadFailed(false);
        setFailureKind(null);
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
      setFailureKind(null);
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

  return { data, loading, loadFailed, failureKind, refresh };
}
