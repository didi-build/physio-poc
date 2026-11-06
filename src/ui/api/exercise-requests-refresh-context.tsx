import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { useExerciseRequestsApi } from "./exercise-requests-context.js";

type RefreshContextValue = {
  refreshInProgressCount: () => Promise<void>;
};

const RefreshContext = createContext<RefreshContextValue | null>(null);

export function ExerciseRequestsRefreshProvider({
  children,
  onCount,
}: {
  children: ReactNode;
  onCount: (count: number) => void;
}) {
  const requestsClient = useExerciseRequestsApi();

  const refreshInProgressCount = useCallback(async () => {
    try {
      const { in_progress_count } = await requestsClient.getInProgressCount();
      onCount(in_progress_count);
    } catch {
      onCount(0);
    }
  }, [onCount, requestsClient]);

  useEffect(() => {
    void refreshInProgressCount();
  }, [refreshInProgressCount]);

  return (
    <RefreshContext.Provider value={{ refreshInProgressCount }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useExerciseRequestsRefresh(): RefreshContextValue {
  const ctx = useContext(RefreshContext);
  if (!ctx) {
    throw new Error("ExerciseRequestsRefreshProvider is missing");
  }
  return ctx;
}
