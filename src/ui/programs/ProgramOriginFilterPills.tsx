import {
  FILTER_ALL_PROGRAMS,
  FILTER_FROM_ROUTINE,
  FILTER_FROM_SCRATCH,
} from "../copy/programs.js";

/** Built for DIDI-1141; origin data not on list API yet. Not rendered on the list screen. */
export function ProgramOriginFilterPills(): null {
  void FILTER_ALL_PROGRAMS;
  void FILTER_FROM_ROUTINE;
  void FILTER_FROM_SCRATCH;
  return null;
}
