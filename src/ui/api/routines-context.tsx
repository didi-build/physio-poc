import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  getRoutinesClient,
  RoutinesClient,
  type RoutinesClientOptions,
} from "./routines-client.js";

const RoutinesApiContext = createContext<RoutinesClient | null>(null);

export type RoutinesApiProviderProps = {
  children: ReactNode;
  client?: RoutinesClient;
  clientOptions?: RoutinesClientOptions;
};

export function RoutinesApiProvider({
  children,
  client,
  clientOptions,
}: RoutinesApiProviderProps) {
  const value = useMemo(
    () => client ?? new RoutinesClient(clientOptions),
    [client, clientOptions],
  );
  return (
    <RoutinesApiContext.Provider value={value}>{children}</RoutinesApiContext.Provider>
  );
}

export function useRoutinesApi(): RoutinesClient {
  const fromContext = useContext(RoutinesApiContext);
  return fromContext ?? getRoutinesClient();
}
