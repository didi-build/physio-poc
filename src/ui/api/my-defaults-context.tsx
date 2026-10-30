import { createContext, useContext, type ReactNode } from "react";
import { getMyDefaultsClient, type MyDefaultsClient } from "./my-defaults-client.js";

const MyDefaultsApiContext = createContext<MyDefaultsClient | null>(null);

export function MyDefaultsApiProvider({
  client,
  children,
}: {
  client?: MyDefaultsClient;
  children: ReactNode;
}) {
  const value = client ?? getMyDefaultsClient();
  return (
    <MyDefaultsApiContext.Provider value={value}>
      {children}
    </MyDefaultsApiContext.Provider>
  );
}

export function useMyDefaultsApi(): MyDefaultsClient {
  const client = useContext(MyDefaultsApiContext);
  if (!client) {
    throw new Error("useMyDefaultsApi must be used within MyDefaultsApiProvider");
  }
  return client;
}
