export const ROUTINE_DETAIL_LOAD_FAILED_BOOTSTRAP_DIAGNOSIS =
  "Diagnosis: bootstrap/session-gate failure (routines.detail read count is 0).";

export const ROUTINE_DETAIL_LOAD_FAILED_UI_BUG_DIAGNOSIS =
  "Diagnosis: possible UI bug (routines.detail read count >= 1 but error slot missing).";

export const ROUTINE_DETAIL_LOAD_FAILED_INCONCLUSIVE_DIAGNOSIS =
  "Diagnosis: inconclusive terminal state.";

export type RoutineDetailLoadFailedProbeState = {
  routinesDetailCount: number;
  busyPresent: boolean;
  errorSlotPresent: boolean;
  errorSlotInRtDetail: boolean;
  layoutRootPresent: boolean;
  rtDetailPresent: boolean;
  href: string;
};

export function routineDetailLoadFailedDiagnosis(
  state: RoutineDetailLoadFailedProbeState,
): string {
  if (state.routinesDetailCount === 0) {
    return ROUTINE_DETAIL_LOAD_FAILED_BOOTSTRAP_DIAGNOSIS;
  }
  if (state.routinesDetailCount >= 1 && !state.errorSlotInRtDetail) {
    return ROUTINE_DETAIL_LOAD_FAILED_UI_BUG_DIAGNOSIS;
  }
  return ROUTINE_DETAIL_LOAD_FAILED_INCONCLUSIVE_DIAGNOSIS;
}

export function formatRoutineDetailLoadFailedTimeoutMessage(
  state: RoutineDetailLoadFailedProbeState,
  consoleErrors: readonly string[],
  pageErrors: readonly string[],
  timeoutMs: number,
): string {
  const lines = [
    `Routine detail load-failed harness wait timed out (${timeoutMs}ms).`,
    routineDetailLoadFailedDiagnosis(state),
    `routines.detail count=${state.routinesDetailCount}`,
    `busy present=${state.busyPresent}`,
    `error slot present=${state.errorSlotPresent}`,
    `error slot inside .rt-detail=${state.errorSlotInRtDetail}`,
    `layout root present=${state.layoutRootPresent}`,
    `.rt-detail present=${state.rtDetailPresent}`,
    `location.href=${state.href}`,
  ];
  if (consoleErrors.length > 0) {
    lines.push(`recent console errors: ${consoleErrors.join(" | ")}`);
  }
  if (pageErrors.length > 0) {
    lines.push(`recent page errors: ${pageErrors.join(" | ")}`);
  }
  return lines.join("\n");
}
