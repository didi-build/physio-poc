import type { ProgramAutoSaveStatus } from "../../services/programs/types.js";
import { AUTO_SAVE_NOTE, PUBLISH, formatAutoSaveStatus } from "../copy/programs.js";
import { AutoSaveStatus } from "./AutoSaveStatus.js";
import type { AutoSaveUiState } from "./use-program-auto-save.js";

export type BuilderPublishCardProps = {
  autoSaveStatus: ProgramAutoSaveStatus;
  publishedAt?: string;
  saveUiState: AutoSaveUiState;
  failureAlertShown: boolean;
  publishAllowed: boolean;
  onTryAgain: () => void;
};

export function BuilderPublishCard({
  autoSaveStatus,
  publishedAt,
  saveUiState,
  failureAlertShown,
  publishAllowed,
  onTryAgain,
}: BuilderPublishCardProps) {
  const statusLine = formatAutoSaveStatus(autoSaveStatus, publishedAt);

  return (
    <aside className="pg-publish-card">
      <p className="pg-publish-card-status">{statusLine}</p>
      <AutoSaveStatus
        className="pg-autosave--desktop"
        state={saveUiState}
        failureAlertShown={failureAlertShown}
        onTryAgain={onTryAgain}
        showFailureAlert={false}
      />
      <p className="pg-publish-card-note">{AUTO_SAVE_NOTE}</p>
      <button
        type="button"
        className="pg-btn pg-btn--primary"
        disabled={!publishAllowed}
      >
        {PUBLISH}
      </button>
    </aside>
  );
}
