import {
  AUTO_SAVE_FAILURE_ALERT,
  AUTO_SAVE_FAILURE_HELPER,
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_SAVED,
  AUTO_SAVE_SAVING,
  AUTO_SAVE_TRY_AGAIN,
  AUTO_SAVE_TRY_AGAIN_ARIA,
} from "../copy/programs.js";
import type { AutoSaveUiState } from "./use-program-auto-save.js";

export type AutoSaveStatusProps = {
  state: AutoSaveUiState;
  failureAlertShown: boolean;
  onTryAgain: () => void;
  className?: string;
  showFailureAlert?: boolean;
};

export function AutoSaveStatus({
  state,
  failureAlertShown,
  onTryAgain,
  className,
  showFailureAlert = true,
}: AutoSaveStatusProps) {
  const statusText =
    state === "saving"
      ? AUTO_SAVE_SAVING
      : state === "saved"
        ? AUTO_SAVE_SAVED
        : state === "failed"
          ? AUTO_SAVE_NOT_SAVED
          : AUTO_SAVE_SAVED;

  return (
    <div
      className={className ? `pg-autosave ${className}` : "pg-autosave"}
      aria-live="polite"
    >
      <p className="pg-autosave-status">{statusText}</p>
      {state === "failed" ? (
        <>
          <p className="pg-autosave-helper">{AUTO_SAVE_FAILURE_HELPER}</p>
          {failureAlertShown && showFailureAlert ? (
            <p className="pg-autosave-alert" role="alert">
              {AUTO_SAVE_FAILURE_ALERT}
            </p>
          ) : null}
          <button
            type="button"
            className="pg-btn pg-btn--secondary"
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
