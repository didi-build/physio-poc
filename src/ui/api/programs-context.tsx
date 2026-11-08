import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getProgramsClient, ProgramsClient } from "./programs-client.js";
import { wrapProgramsClientWithCacheInvalidation } from "./caching-programs-client.js";

const ProgramsApiContext = createContext<ProgramsClient | null>(null);

export function ProgramsApiProvider({
  client,
  children,
}: {
  client?: ProgramsClient;
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const base = client ?? getProgramsClient();
    return client ? base : wrapProgramsClientWithCacheInvalidation(base);
  }, [client]);
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
