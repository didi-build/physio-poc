import { createContext, useContext, type ReactNode } from "react";
import {
  ExerciseRequestsClient,
  getExerciseRequestsClient,
} from "./exercise-requests-client.js";

const ExerciseRequestsApiContext = createContext<ExerciseRequestsClient | null>(null);

export function ExerciseRequestsApiProvider({
  client,
  children,
}: {
  client?: ExerciseRequestsClient;
  children: ReactNode;
}) {
  return (
    <ExerciseRequestsApiContext.Provider value={client ?? getExerciseRequestsClient()}>
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
