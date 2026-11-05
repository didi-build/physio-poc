import type { ProgramRoutineOriginView } from "../../services/programs/types.js";
import { programCardOriginLineText } from "../copy/programs.js";

export type ProgramCardOriginLineProps = {
  origin: ProgramRoutineOriginView | null;
};

export function ProgramCardOriginLine({ origin }: ProgramCardOriginLineProps) {
  return <p className="pg-card-origin">{programCardOriginLineText(origin)}</p>;
}
