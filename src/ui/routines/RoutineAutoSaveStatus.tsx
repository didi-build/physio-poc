import { DRAFT_SAVED_UNTIL_PUBLISH, DRAFT_SAVING } from "../copy/routines.js";
import { SharedFailedSaveAlert } from "../shared-load-states/SharedLoadStates.js";
import type { AutoSaveUiState } from "../programs/use-program-auto-save.js";

export type RoutineAutoSaveStatusProps = {
  state: AutoSaveUiState;
  failureAlertShown: boolean;
  failureMessage: string;
  onTryAgain: () => void;
};

export function RoutineAutoSaveStatus({
  state,
  failureAlertShown,
  failureMessage,
  onTryAgain,
}: RoutineAutoSaveStatusProps) {
  const text =
    state === "saving" || state === "idle"
      ? DRAFT_SAVING
      : state === "failed"
        ? DRAFT_SAVING
        : DRAFT_SAVED_UNTIL_PUBLISH;

  return (
    <div className="rt-autosave-block">
      <p className="rt-autosave-status" aria-live="polite">
        {text}
      </p>
      {state === "failed" && failureAlertShown ? (
        <SharedFailedSaveAlert
          message={failureMessage}
          onTryAgain={onTryAgain}
          testId="routines-draft-autosave-failed-save-alert"
        />
      ) : null}
    </div>
  );
}
