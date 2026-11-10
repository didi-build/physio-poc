import type {
  ProgramAutoSaveStatus,
  ShareLinkStatus,
} from "../../services/programs/types.js";
import {
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_SAVED,
  AUTO_SAVE_SAVING,
} from "../copy/programs.js";
import {
  STICKY_LINK_SETTINGS,
  STICKY_PUBLISH_HEADING,
} from "../copy/program-publish.js";
import { AutoSaveStatus } from "./AutoSaveStatus.js";
import type { AutoSaveUiState } from "./use-program-auto-save.js";
import { stickyPublishHelperText } from "./program-publish-card-copy.js";

export type BuilderPublishCardProps = {
  autoSaveStatus: ProgramAutoSaveStatus;
  publishedAt?: string | null;
  shareLinkStatus: ShareLinkStatus;
  saveUiState: AutoSaveUiState;
  failureAlertShown: boolean;
  showFailureAlert?: boolean;
  publishAllowed: boolean;
  primaryDisabled?: boolean;
  primaryLabel: string;
  pendingChanges: boolean;
  expiryLine: string | null;
  showLinkSettings: boolean;
  onPrimary: () => void;
  onLinkSettings: () => void;
  onTryAgain: () => void;
};

export type BuilderPublishPhoneBarProps = {
  publishAllowed: boolean;
  primaryDisabled?: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  onAddExercise?: () => void;
};

export function BuilderPublishPhoneBar({
  publishAllowed,
  primaryDisabled = false,
  primaryLabel,
  onPrimary,
}: BuilderPublishPhoneBarProps) {
  return (
    <div className="pg-publish-phone-bar">
      <button
        type="button"
        className="pg-btn pg-btn--primary pg-publish-phone-bar-btn"
        disabled={!publishAllowed || primaryDisabled}
        onClick={onPrimary}
      >
        {primaryLabel}
      </button>
    </div>
  );
}

export function BuilderPublishCard({
  autoSaveStatus,
  publishedAt,
  shareLinkStatus,
  saveUiState,
  failureAlertShown,
  showFailureAlert = true,
  publishAllowed,
  primaryDisabled = false,
  primaryLabel,
  pendingChanges,
  expiryLine,
  showLinkSettings,
  onPrimary,
  onLinkSettings,
  onTryAgain,
}: BuilderPublishCardProps) {
  const helper = stickyPublishHelperText({
    autoSaveStatus,
    shareLinkStatus,
    publishedAt: publishedAt ?? null,
    pendingChanges,
  });
  const saveLabel =
    saveUiState === "saving"
      ? AUTO_SAVE_SAVING
      : saveUiState === "failed"
        ? AUTO_SAVE_NOT_SAVED
        : AUTO_SAVE_SAVED;

  return (
    <aside className="pg-publish-card pg-publish-card--desktop">
      <div className="pg-publish-card-head">
        <h2 className="pg-publish-card-title">{STICKY_PUBLISH_HEADING}</h2>
        <span className="pg-publish-card-save" aria-live="polite">
          {saveLabel}
        </span>
      </div>
      <p className="pg-publish-card-helper">{helper}</p>
      <AutoSaveStatus
        className="pg-autosave--desktop"
        state={saveUiState}
        failureAlertShown={failureAlertShown}
        showFailureAlert={showFailureAlert}
        onTryAgain={onTryAgain}
      />
      <button
        type="button"
        className="pg-btn pg-btn--primary pg-publish-card-primary"
        disabled={!publishAllowed || primaryDisabled}
        onClick={onPrimary}
      >
        {primaryLabel}
      </button>
      {expiryLine || showLinkSettings ? (
        <p className="pg-publish-card-foot">
          {expiryLine ? <span>{expiryLine}</span> : null}
          {showLinkSettings ? (
            <>
              {expiryLine ? " · " : null}
              <button
                type="button"
                className="pg-link-btn pg-publish-card-settings"
                onClick={onLinkSettings}
              >
                {STICKY_LINK_SETTINGS}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </aside>
  );
}
