import { createContext, useContext, useEffect, type ReactNode } from "react";
import { usePractitionerSession } from "./practitioner-session-context.js";
import { getSessionReadCache } from "./session-read-cache.js";

const SessionReadCacheEpochContext = createContext("");

export function SessionReadCacheProvider({ children }: { children: ReactNode }) {
  const sessionState = usePractitionerSession();
  const cache = getSessionReadCache();

  const practitionerId =
    sessionState.status === "ready" ? sessionState.session.practitioner_id : "";

  if (sessionState.status === "ready") {
    cache.bindSession(sessionState.session.practitioner_id);
  } else if (sessionState.status === "error") {
    cache.bindSession("");
  }

  useEffect(() => {
    if (sessionState.status === "ready") {
      cache.bindSession(sessionState.session.practitioner_id);
      return;
    }
    if (sessionState.status === "error") {
      cache.bindSession("");
    }
  }, [
    cache,
    sessionState.status,
    sessionState.status === "ready" ? sessionState.session.practitioner_id : null,
  ]);

  const epoch = practitionerId;

  return (
    <SessionReadCacheEpochContext.Provider value={epoch}>
      {children}
    </SessionReadCacheEpochContext.Provider>
  );
}

export function useSessionReadCacheEpoch(): string {
  return useContext(SessionReadCacheEpochContext);
}
