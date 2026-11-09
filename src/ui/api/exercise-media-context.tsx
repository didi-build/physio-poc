import { createContext, useContext, useMemo, type ReactNode } from "react";
import { wrapExerciseMediaClientWithCacheInvalidation } from "./caching-exercise-media-client.js";
import {
  ExerciseMediaClient,
  getExerciseMediaClient,
} from "./exercise-media-client.js";

const ExerciseMediaApiContext = createContext<ExerciseMediaClient | null>(null);

export function ExerciseMediaApiProvider({
  client,
  children,
}: {
  client?: ExerciseMediaClient;
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const base = client ?? getExerciseMediaClient();
    return client ? base : wrapExerciseMediaClientWithCacheInvalidation(base);
  }, [client]);
  return (
    <ExerciseMediaApiContext.Provider value={value}>
      {children}
    </ExerciseMediaApiContext.Provider>
  );
}

export function useExerciseMediaApi(): ExerciseMediaClient {
  const client = useContext(ExerciseMediaApiContext);
  if (!client) {
    throw new Error("ExerciseMediaApiProvider is missing");
  }
  return client;
}
