import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ProgramBuilderView } from "../../services/programs/types.js";
import type { ProgramShareConnectorView } from "../../services/programs/program-publish-service.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { PROGRAM_PUBLISH_NAME_REQUIRED } from "../../copy/programs-share.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import { ProgramsApiError, type ProgramsClient } from "../api/programs-client.js";
import { PROGRAM_PUBLISH_ERROR_MESSAGE } from "../copy/programs-states.js";
import { UNTITLED_PROGRAM } from "../copy/programs.js";
import { ProgramLinkExpiryField } from "./ProgramLinkExpiryField.js";
import { PublishPlaceholderNotice } from "./PublishPlaceholderNotice.js";
import {
  EXPIRY_APPLIES_NEW_LINK,
  EXPIRY_APPLIES_RIGHT_AWAY,
  LINK_EXPIRES_HEADING,
  LINK_EXPIRES_PROGRAM_ONLY,
  PROGRAM_NAME_REQUIRED_LABEL,
  PROGRAM_NAME_REQUIRED_PAREN,
  PUBLISH_COPY_LINK,
  PUBLISH_FIRST_PUBLISH_HEADING,
  PUBLISH_LINK_COPIED,
  PUBLISH_NAME_ROUTINE_HINT,
  PUBLISH_NEW_LINK_HELPER,
  PUBLISH_NO_LINK_FIRST,
  PUBLISH_NO_OPEN_LINK,
  PUBLISH_NOT_YET,
  PUBLISH_NOW,
  PUBLISH_SAME_LINK_HELPER,
  PUBLISH_SHARE_LINK_HEADING,
  PUBLISH_SHEET_TITLE,
  programCardMeta,
  publishChangesSinceHeading,
} from "../copy/program-publish.js";

export type PublishSheetProps = {
  open: boolean;
  program: ProgramBuilderView;
  shareView: ProgramShareConnectorView | null;
  client: ProgramsClient;
  nameDraft: string;
  showNameField: boolean;
  onNameChange: (value: string) => void;
  onProgramUpdated: (program: ProgramBuilderView) => void;
  onClose: () => void;
  onPublished: (input: {
    program: ProgramBuilderView;
    shareLink: string;
    newLink: boolean;
  }) => void;
  onNotYet: () => void;
  onRemovePlaceholder: (rowId: string) => void;
};

function initialExpiryChoice(
  shareView: ProgramShareConnectorView | null,
): ShareLinkExpiresIn {
  return (
    shareView?.link_expires_in ??
    shareView?.practitioner_default_expires_in ??
    SHARE_LINK_EXPIRES_IN.one_year
  );
}

export function PublishSheet({
  open,
  program,
  shareView,
  client,
  nameDraft,
  showNameField,
  onNameChange,
  onProgramUpdated,
  onClose,
  onPublished,
  onNotYet,
  onRemovePlaceholder,
}: PublishSheetProps) {
  const titleId = useId();
  const nameHelpId = useId();
  const placeholderNoticeId = useId();
  const [expiry, setExpiry] = useState<ShareLinkExpiresIn>(
    initialExpiryChoice(shareView),
  );
  const [customDate, setCustomDate] = useState(shareView?.link_expires_on ?? "");
  const [publishBusy, setPublishBusy] = useState(false);
  const [copyHint, setCopyHint] = useState("");
  const [placeholderNoticeCleared, setPlaceholderNoticeCleared] = useState(false);

  const placeholders = useMemo(
    () => program.rows.filter((row) => row.kind === "placeholder"),
    [program.rows],
  );

  const isFirstPublish = program.auto_save_status.kind === "not_published_yet";
  const noOpenLink =
    !shareView?.open_share_link || shareView.share_link_status !== "open";
  const shareUrl = shareView?.share_link ?? "";

  const trimmedName = nameDraft.trim();
  const nameInvalid = trimmedName.length === 0;
  const placeholdersBlock = placeholders.length > 0;
  const publishDisabled =
    publishBusy || nameInvalid || placeholdersBlock || program.rows.length === 0;

  useEffect(() => {
    if (!open) {
      return;
    }
    setExpiry(initialExpiryChoice(shareView));
    setCustomDate(shareView?.link_expires_on ?? "");
    setCopyHint("");
    setPlaceholderNoticeCleared(false);
  }, [open, shareView]);

  const expiryHelper = noOpenLink ? EXPIRY_APPLIES_NEW_LINK : EXPIRY_APPLIES_RIGHT_AWAY;

  const shareLinkHelper = noOpenLink
    ? isFirstPublish
      ? PUBLISH_NO_LINK_FIRST
      : PUBLISH_NO_OPEN_LINK
    : PUBLISH_SAME_LINK_HELPER;

  const changeHeading = isFirstPublish
    ? PUBLISH_FIRST_PUBLISH_HEADING
    : shareView?.published_at
      ? publishChangesSinceHeading(shareView.published_at)
      : PUBLISH_FIRST_PUBLISH_HEADING;

  const changeLines = shareView?.publish_change_lines ?? [];

  const onCopy = useCallback(async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyHint(PUBLISH_LINK_COPIED);
    } catch {
      setCopyHint("");
    }
  }, [shareUrl]);

  const runPublish = async () => {
    if (publishDisabled) {
      return;
    }
    setPublishBusy(true);
    try {
      if (trimmedName !== (program.name ?? "")) {
        const updated = await client.updateProgramName(program.program_id, trimmedName);
        onProgramUpdated(updated.program);
      }
      const hadOpenLink =
        shareView?.open_share_link && shareView.share_link_status === "open";
      const body =
        expiry === SHARE_LINK_EXPIRES_IN.custom_date
          ? {
              expires_in: expiry,
              custom_expires_on: customDate.trim() || null,
            }
          : { expires_in: expiry };
      const result = await client.publishProgram(program.program_id, body);
      onPublished({
        program: result.program,
        shareLink: result.share_link,
        newLink: !hadOpenLink,
      });
    } catch (error) {
      if (
        error instanceof ProgramsApiError &&
        error.code !== "name_required" &&
        error.code !== "placeholders_block_publish" &&
        PROGRAM_PUBLISH_ERROR_MESSAGE
      ) {
        // Designer-owned copy slot when defined.
      }
    } finally {
      setPublishBusy(false);
    }
  };

  const publishDescribedBy = placeholdersBlock ? placeholderNoticeId : undefined;

  return (
    <ConfirmSheet
      open={open}
      title={PUBLISH_SHEET_TITLE}
      titleId={titleId}
      onClose={onClose}
      footer={
        <div className="pg-publish-sheet-footer">
          <button type="button" className="pg-btn pg-btn--secondary" onClick={onNotYet}>
            {PUBLISH_NOT_YET}
          </button>
          <button
            type="button"
            className="pg-btn pg-btn--primary"
            disabled={publishDisabled}
            aria-describedby={publishDescribedBy}
            onClick={() => {
              void runPublish();
            }}
          >
            {PUBLISH_NOW}
          </button>
        </div>
      }
    >
      <div className="pg-publish-program-card">
        <div className="pg-publish-program-card-icon" aria-hidden="true" />
        <div className="pg-publish-program-card-text">
          <div className="pg-publish-program-name">
            {program.name?.trim() ? program.name : UNTITLED_PROGRAM}
          </div>
          <div className="pg-publish-program-meta" data-testid="publish-program-meta">
            {programCardMeta(program.code, program.exercise_count)}
          </div>
        </div>
      </div>

      {placeholders.length > 0 || placeholderNoticeCleared ? (
        <div id={placeholderNoticeId}>
          <PublishPlaceholderNotice
            placeholders={placeholders}
            showRepublishLine={
              !isFirstPublish && program.auto_save_status.kind === "unpublished_changes"
            }
            publishedAt={shareView?.published_at ?? null}
            onRemove={(rowId) => {
              const before = placeholders.length;
              onRemovePlaceholder(rowId);
              if (before === 1) {
                setPlaceholderNoticeCleared(true);
              }
            }}
          />
        </div>
      ) : null}

      {showNameField ? (
        <div className="pg-publish-name-field">
          <label htmlFor="pg-publish-name-input" className="pg-publish-name-label">
            {PROGRAM_NAME_REQUIRED_LABEL}{" "}
            <span className="pg-publish-name-optional">
              {PROGRAM_NAME_REQUIRED_PAREN}
            </span>
          </label>
          <input
            id="pg-publish-name-input"
            className={`pg-publish-name-input${
              nameInvalid ? " pg-publish-name-input--invalid" : ""
            }`}
            value={nameDraft}
            aria-invalid={nameInvalid}
            aria-describedby={nameHelpId}
            onChange={(event) => {
              onNameChange(event.target.value);
            }}
          />
          {nameInvalid ? (
            <p id={nameHelpId} className="pg-publish-name-error" role="alert">
              {PROGRAM_PUBLISH_NAME_REQUIRED}
            </p>
          ) : (
            <p id={nameHelpId} className="pg-publish-name-hint">
              {program.routine_origin ? PUBLISH_NAME_ROUTINE_HINT : null}
            </p>
          )}
        </div>
      ) : null}

      <h3 className="pg-publish-section-heading">{changeHeading}</h3>
      <ul className="pg-publish-change-list">
        {changeLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h3 className="pg-publish-section-heading">{PUBLISH_SHARE_LINK_HEADING}</h3>
      {noOpenLink || !shareUrl ? (
        <p className="pg-publish-no-link">{shareLinkHelper}</p>
      ) : (
        <div className="pg-publish-link-row">
          <span className="pg-publish-link-url">{shareUrl}</span>
          <button
            type="button"
            className="pg-btn pg-btn--secondary pg-publish-copy-btn"
            onClick={() => {
              void onCopy();
            }}
          >
            {PUBLISH_COPY_LINK}
          </button>
        </div>
      )}
      {noOpenLink ? (
        <p className="pg-publish-link-footnote">{PUBLISH_NEW_LINK_HELPER}</p>
      ) : null}
      {copyHint ? (
        <p className="pg-publish-copy-hint" aria-live="polite">
          {copyHint}
        </p>
      ) : null}

      <div className="pg-publish-expiry-block">
        <div className="pg-publish-expiry-head">
          <h3 className="pg-publish-section-heading">{LINK_EXPIRES_HEADING}</h3>
          <span className="pg-publish-expiry-scope">{LINK_EXPIRES_PROGRAM_ONLY}</span>
        </div>
        <ProgramLinkExpiryField
          value={expiry}
          customDate={customDate}
          defaultChoice={SHARE_LINK_EXPIRES_IN.one_year}
          onChange={setExpiry}
          onCustomDateChange={setCustomDate}
        />
        <p className="pg-publish-expiry-helper">{expiryHelper}</p>
      </div>
    </ConfirmSheet>
  );
}
