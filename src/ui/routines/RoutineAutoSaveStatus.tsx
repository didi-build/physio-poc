import { DRAFT_SAVED_UNTIL_PUBLISH, DRAFT_SAVING } from "../copy/routines.js";
import type { AutoSaveUiState } from "../programs/use-program-auto-save.js";

export type RoutineAutoSaveStatusProps = {
  state: AutoSaveUiState;
};

export function RoutineAutoSaveStatus({ state }: RoutineAutoSaveStatusProps) {
  const text =
    state === "saving" || state === "idle" ? DRAFT_SAVING : DRAFT_SAVED_UNTIL_PUBLISH;
  return (
    <p className="rt-autosave-status" aria-live="polite">
      {state === "saved" ? "✓ " : null}
      {text}
    </p>
  );
}
