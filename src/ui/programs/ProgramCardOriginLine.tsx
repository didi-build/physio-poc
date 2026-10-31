import type { ProgramRoutineOriginView } from "../../services/programs/types.js";
import { programCardOriginLineText } from "../copy/programs.js";

export type ProgramCardOriginLineProps = {
  origin: ProgramRoutineOriginView | null;
};

/** Built for DIDI-1141; not mounted until list API supplies origin (DIDI-1140). */
export function ProgramCardOriginLine({ origin }: ProgramCardOriginLineProps) {
  return <p className="pg-card-origin">{programCardOriginLineText(origin)}</p>;
}
