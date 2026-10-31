import { createContext, useContext, type ReactNode } from "react";

export type ProgramLeaveGuard = {
  hasUnsavedEdits: boolean;
  requestLeave: (to: string) => void;
};

type ProgramLeaveGuardContextValue = {
  guard: ProgramLeaveGuard | null;
  setGuard: (guard: ProgramLeaveGuard | null) => void;
};

const ProgramLeaveGuardContext = createContext<ProgramLeaveGuardContextValue>({
  guard: null,
  setGuard: () => {},
});

export function ProgramLeaveGuardProvider({
  guard,
  setGuard,
  children,
}: {
  guard: ProgramLeaveGuard | null;
  setGuard: (guard: ProgramLeaveGuard | null) => void;
  children: ReactNode;
}) {
  return (
    <ProgramLeaveGuardContext.Provider value={{ guard, setGuard }}>
      {children}
    </ProgramLeaveGuardContext.Provider>
  );
}

export function useProgramLeaveGuard(): ProgramLeaveGuardContextValue {
  return useContext(ProgramLeaveGuardContext);
}
