import {
  AUTO_SAVE_FAILURE_HELPER,
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_SAVED,
  AUTO_SAVE_SAVING,
  AUTO_SAVE_TRY_AGAIN_ARIA,
} from "../copy/programs.js";
import { SharedTryAgainButton } from "../shared-load-states/SharedLoadStates.js";
import type { AutoSaveUiState } from "./use-program-auto-save.js";

export type AutoSaveStatusProps = {
  state: AutoSaveUiState;
  failureAlertShown: boolean;
  failureMessage: string;
  onTryAgain: () => void | Promise<void>;
  className?: string;
  showFailureAlert?: boolean;
};

export function AutoSaveStatus({
  state,
  failureAlertShown,
  failureMessage,
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
            <p
              className="pg-autosave-alert"
              role="alert"
              data-testid="programs-autosave-failed-save-alert"
            >
              {failureMessage}
            </p>
          ) : null}
          <SharedTryAgainButton
            onTryAgain={onTryAgain}
            className="pg-btn pg-btn--secondary"
            ariaLabel={AUTO_SAVE_TRY_AGAIN_ARIA}
          />
        </>
      ) : null}
    </div>
  );
}
