import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  ExerciseRequestsClient,
  getExerciseRequestsClient,
} from "./exercise-requests-client.js";
import { wrapExerciseRequestsClientWithCacheInvalidation } from "./caching-exercise-requests-client.js";

const ExerciseRequestsApiContext = createContext<ExerciseRequestsClient | null>(null);

export function ExerciseRequestsApiProvider({
  client,
  children,
}: {
  client?: ExerciseRequestsClient;
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const base = client ?? getExerciseRequestsClient();
    return client ? base : wrapExerciseRequestsClientWithCacheInvalidation(base);
  }, [client]);
  return (
    <ExerciseRequestsApiContext.Provider value={value}>
      {children}
    </ExerciseRequestsApiContext.Provider>
  );
}

export function useExerciseRequestsApi(): ExerciseRequestsClient {
  const client = useContext(ExerciseRequestsApiContext);
  if (!client) {
    throw new Error("ExerciseRequestsApiProvider is missing");
  }
  return client;
}
