import { createContext, useContext, type ReactNode } from "react";
import { getProgramsClient, type ProgramsClient } from "./programs-client.js";

const ProgramsApiContext = createContext<ProgramsClient | null>(null);

export function ProgramsApiProvider({
  client,
  children,
}: {
  client?: ProgramsClient;
  children: ReactNode;
}) {
  const value = client ?? getProgramsClient();
  return (
    <ProgramsApiContext.Provider value={value}>{children}</ProgramsApiContext.Provider>
  );
}

export function useProgramsApi(): ProgramsClient {
  const client = useContext(ProgramsApiContext);
  if (!client) {
    throw new Error("useProgramsApi must be used within ProgramsApiProvider");
  }
  return client;
}
