import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PractitionerSessionView } from "../../services/practitioner-session/types.js";
import {
  getPractitionerSessionClient,
  type PractitionerSessionClient,
} from "./practitioner-session-client.js";

export type PractitionerSessionState =
  | { status: "loading" }
  | { status: "ready"; session: PractitionerSessionView }
  | { status: "error" };

type PractitionerSessionContextValue = PractitionerSessionState;

const PractitionerSessionContext =
  createContext<PractitionerSessionContextValue | null>(null);

export function PractitionerSessionProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: PractitionerSessionClient;
}) {
  const [state, setState] = useState<PractitionerSessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const sessionClient = client ?? getPractitionerSessionClient();
    void sessionClient
      .getSession()
      .then((session) => {
        if (!cancelled) {
          setState({ status: "ready", session });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <PractitionerSessionContext.Provider value={state}>
      {children}
    </PractitionerSessionContext.Provider>
  );
}

export function usePractitionerSession(): PractitionerSessionContextValue {
  const ctx = useContext(PractitionerSessionContext);
  if (!ctx) {
    throw new Error("PractitionerSessionProvider is missing");
  }
  return ctx;
}
