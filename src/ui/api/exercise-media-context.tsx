import { createContext, useContext, type ReactNode } from "react";
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
  return (
    <ExerciseMediaApiContext.Provider value={client ?? getExerciseMediaClient()}>
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
