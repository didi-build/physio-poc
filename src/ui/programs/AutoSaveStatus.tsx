import {
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_SAVED,
  AUTO_SAVE_SAVING,
} from "../copy/programs.js";
import { SharedFailedSaveAlert } from "../shared-load-states/SharedLoadStates.js";
import type { AutoSaveUiState } from "./use-program-auto-save.js";

export type AutoSaveStatusProps = {
  state: AutoSaveUiState;
  failureAlertShown: boolean;
  failureMessage: string;
  onTryAgain: () => void;
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
      {state === "failed" && failureAlertShown && showFailureAlert ? (
        <SharedFailedSaveAlert
          message={failureMessage}
          onTryAgain={onTryAgain}
          testId="programs-autosave-failed-save-alert"
        />
      ) : null}
    </div>
  );
}
