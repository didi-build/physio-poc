import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  ExerciseLibraryClient,
  getExerciseLibraryClient,
  type ExerciseLibraryClientOptions,
} from "./exercise-library-client.js";
import { wrapExerciseLibraryClientWithCacheInvalidation } from "./caching-exercise-library-client.js";

const ExerciseLibraryApiContext = createContext<ExerciseLibraryClient | null>(null);

export type ExerciseLibraryApiProviderProps = {
  children: ReactNode;
  client?: ExerciseLibraryClient;
  clientOptions?: ExerciseLibraryClientOptions;
};

export function ExerciseLibraryApiProvider({
  children,
  client,
  clientOptions,
}: ExerciseLibraryApiProviderProps) {
  const value = useMemo(() => {
    const base = client ?? new ExerciseLibraryClient(clientOptions);
    return client ? base : wrapExerciseLibraryClientWithCacheInvalidation(base);
  }, [client, clientOptions]);
  return (
    <ExerciseLibraryApiContext.Provider value={value}>
      {children}
    </ExerciseLibraryApiContext.Provider>
  );
}

export function useExerciseLibraryApi(): ExerciseLibraryClient {
  const fromContext = useContext(ExerciseLibraryApiContext);
  return fromContext ?? getExerciseLibraryClient();
}
