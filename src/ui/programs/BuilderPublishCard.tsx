import type { ProgramAutoSaveStatus } from "../../services/programs/types.js";
import { AUTO_SAVE_NOTE, PUBLISH, formatAutoSaveStatus } from "../copy/programs.js";
import { AutoSaveStatus } from "./AutoSaveStatus.js";
import type { AutoSaveUiState } from "./use-program-auto-save.js";

export type BuilderPublishCardProps = {
  autoSaveStatus: ProgramAutoSaveStatus;
  publishedAt?: string;
  saveUiState: AutoSaveUiState;
  failureAlertShown: boolean;
  showFailureAlert?: boolean;
  publishAllowed: boolean;
  onPublish: () => void;
  onTryAgain: () => void;
};

export type BuilderPublishPhoneBarProps = {
  publishAllowed: boolean;
  onPublish: () => void;
};

export function BuilderPublishPhoneBar({
  publishAllowed,
  onPublish,
}: BuilderPublishPhoneBarProps) {
  return (
    <div className="pg-publish-phone-bar">
      <button
        type="button"
        className="pg-btn pg-btn--primary pg-publish-phone-bar-btn"
        disabled={!publishAllowed}
        onClick={onPublish}
      >
        {PUBLISH}
      </button>
    </div>
  );
}

export function BuilderPublishCard({
  autoSaveStatus,
  publishedAt,
  saveUiState,
  failureAlertShown,
  showFailureAlert = true,
  publishAllowed,
  onPublish,
  onTryAgain,
}: BuilderPublishCardProps) {
  const statusLine = formatAutoSaveStatus(autoSaveStatus, publishedAt);

  return (
    <aside className="pg-publish-card pg-publish-card--desktop">
      <p className="pg-publish-card-status">{statusLine}</p>
      <AutoSaveStatus
        className="pg-autosave--desktop"
        state={saveUiState}
        failureAlertShown={failureAlertShown}
        showFailureAlert={showFailureAlert}
        onTryAgain={onTryAgain}
      />
      <p className="pg-publish-card-note">{AUTO_SAVE_NOTE}</p>
      <button
        type="button"
        className="pg-btn pg-btn--primary"
        disabled={!publishAllowed}
        onClick={onPublish}
      >
        {PUBLISH}
      </button>
    </aside>
  );
}
