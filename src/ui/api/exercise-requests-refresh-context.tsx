import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { exerciseRequestsInProgressCountKey } from "./navigation-read-cache-keys.js";
import { useExerciseRequestsApi } from "./exercise-requests-context.js";
import { useSessionReadCacheEpoch } from "./session-read-cache-context.js";
import { usePractitionerSession } from "./practitioner-session-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";

type RefreshContextValue = {
  refreshInProgressCount: (options?: { force?: boolean }) => Promise<void>;
  refreshRequestsOnWindowFocus: () => void;
  registerRequestsListFocusRefresh: (refresh: (() => Promise<void>) | null) => void;
};

const RefreshContext = createContext<RefreshContextValue | null>(null);

function useCoalescedWindowFocusRefresh(onRefresh: () => void, enabled: boolean): void {
  const pendingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const runCoalesced = () => {
      if (pendingRef.current) {
        return;
      }
      pendingRef.current = true;
      queueMicrotask(() => {
        pendingRef.current = false;
        onRefreshRef.current();
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        runCoalesced();
      }
    };
    window.addEventListener("focus", runCoalesced);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", runCoalesced);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}

export function ExerciseRequestsRefreshProvider({
  children,
  onCount,
}: {
  children: ReactNode;
  onCount: (count: number) => void;
}) {
  const requestsClient = useExerciseRequestsApi();
  const sessionEpoch = useSessionReadCacheEpoch();
  const session = usePractitionerSession();
  const sessionReady = session.status === "ready";
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  const countCacheKey =
    sessionReady && sessionEpoch
      ? exerciseRequestsInProgressCountKey(sessionEpoch)
      : null;

  const { data: countData, refresh: refreshCountCache } = useSessionCachedRead<{
    in_progress_count: number;
  }>({
    cacheKey: countCacheKey,
    enabled: sessionReady,
    fetcher: (signal) => requestsClient.getInProgressCount({ signal }),
  });

  useEffect(() => {
    onCountRef.current(countData?.in_progress_count ?? 0);
  }, [countData?.in_progress_count]);

  const listFocusRefreshRef = useRef<(() => Promise<void>) | null>(null);

  const refreshInProgressCount = useCallback(
    async (options?: { force?: boolean }) => {
      await refreshCountCache(options);
    },
    [refreshCountCache],
  );

  const registerRequestsListFocusRefresh = useCallback(
    (refresh: (() => Promise<void>) | null) => {
      listFocusRefreshRef.current = refresh;
    },
    [],
  );

  const refreshRequestsOnWindowFocus = useCallback(() => {
    if (session.status !== "ready") {
      return;
    }
    void refreshInProgressCount({ force: true });
    void listFocusRefreshRef.current?.();
  }, [refreshInProgressCount, session.status]);

  useCoalescedWindowFocusRefresh(refreshRequestsOnWindowFocus, sessionReady);

  const value: RefreshContextValue = {
    refreshInProgressCount,
    refreshRequestsOnWindowFocus,
    registerRequestsListFocusRefresh,
  };

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useExerciseRequestsRefresh(): RefreshContextValue {
  const ctx = useContext(RefreshContext);
  if (!ctx) {
    throw new Error("ExerciseRequestsRefreshProvider is missing");
  }
  return ctx;
}
