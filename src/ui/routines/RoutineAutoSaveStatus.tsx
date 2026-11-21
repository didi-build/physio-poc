import { DRAFT_SAVED_UNTIL_PUBLISH, DRAFT_SAVING } from "../copy/routines.js";
import {
  AUTO_SAVE_FAILURE_HELPER,
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_TRY_AGAIN,
  AUTO_SAVE_TRY_AGAIN_ARIA,
} from "../copy/programs.js";
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
        ? AUTO_SAVE_NOT_SAVED
        : DRAFT_SAVED_UNTIL_PUBLISH;

  return (
    <div className="rt-autosave-block">
      <p className="rt-autosave-status" aria-live="polite">
        {text}
      </p>
      {state === "failed" ? (
        <>
          <p className="rt-autosave-helper">{AUTO_SAVE_FAILURE_HELPER}</p>
          {failureAlertShown ? (
            <p
              className="rt-autosave-alert"
              role="alert"
              data-testid="routines-draft-autosave-failed-save-alert"
            >
              {failureMessage}
            </p>
          ) : null}
          <button
            type="button"
            className="ex-secondary-btn"
            aria-label={AUTO_SAVE_TRY_AGAIN_ARIA}
            onClick={onTryAgain}
          >
            {AUTO_SAVE_TRY_AGAIN}
          </button>
        </>
      ) : null}
    </div>
  );
}
