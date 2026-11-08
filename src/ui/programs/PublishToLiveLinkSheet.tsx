import { useId, useState } from "react";
import type { ProgramBuilderView } from "../../services/programs/types.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import { SHARE_LINK_EXPIRY_CHOICE_LABELS } from "../copy/my-defaults.js";
import {
  FILLED_FROM_ROUTINE_HINT,
  FIRST_PUBLISH,
  LINK_EXPIRES_SECTION,
  NAME_REQUIRED_ERROR,
  NO_LINK_YET_PUBLISH,
  PROGRAM_NAME_LABEL,
  PROGRAM_NAME_REQUIRED_SUFFIX,
  PUBLISH_NOT_YET,
  PUBLISH_NOW,
  PUBLISH_SHEET_TITLE,
  SHARE_LINK_SECTION,
  THIS_PROGRAM_ONLY,
  cardExerciseCountLine,
  programCodeChipLabel,
} from "../copy/programs.js";

const EXPIRY_ORDER: ShareLinkExpiresIn[] = [
  SHARE_LINK_EXPIRES_IN.one_week,
  SHARE_LINK_EXPIRES_IN.thirty_days,
  SHARE_LINK_EXPIRES_IN.ninety_days,
  SHARE_LINK_EXPIRES_IN.one_year,
  SHARE_LINK_EXPIRES_IN.never,
];

export type PublishToLiveLinkSheetProps = {
  open: boolean;
  program: ProgramBuilderView;
  nameDraft: string;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onNotYet: () => void;
  onPublishNow: () => void;
  publishNowDisabled: boolean;
  showNameRequiredError: boolean;
};

export function PublishToLiveLinkSheet({
  open,
  program,
  nameDraft,
  onNameChange,
  onClose,
  onNotYet,
  onPublishNow,
  publishNowDisabled,
  showNameRequiredError,
}: PublishToLiveLinkSheetProps) {
  const titleId = useId();
  const nameLabelId = useId();
  const nameHelpId = useId();
  const neverPublished = program.auto_save_status.kind === "not_published_yet";
  const [expiry, setExpiry] = useState<ShareLinkExpiresIn>(
    SHARE_LINK_EXPIRES_IN.one_year,
  );

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
            onClick={onPublishNow}
            disabled={publishNowDisabled}
          >
            {PUBLISH_NOW}
          </button>
        </div>
      }
    >
      <div className="pg-publish-sheet-card">
        <p className="pg-publish-sheet-card-name">
          {program.name?.trim() ? program.name : nameDraft.trim() || program.name}
        </p>
        <p className="pg-publish-sheet-card-code">
          {programCodeChipLabel(program.code)}
        </p>
        <p className="pg-publish-sheet-card-meta">
          {cardExerciseCountLine(program.exercise_count)}
        </p>
      </div>

      {neverPublished ? (
        <label className="pg-publish-sheet-name-field">
          <span id={nameLabelId}>
            {PROGRAM_NAME_LABEL} {PROGRAM_NAME_REQUIRED_SUFFIX}
          </span>
          <input
            type="text"
            aria-labelledby={nameLabelId}
            aria-describedby={nameHelpId}
            aria-invalid={showNameRequiredError ? true : undefined}
            value={nameDraft}
            onChange={(event) => {
              onNameChange(event.target.value);
            }}
          />
          {program.routine_origin ? (
            <p id={nameHelpId} className="pg-publish-sheet-name-hint">
              {FILLED_FROM_ROUTINE_HINT}
            </p>
          ) : null}
          {showNameRequiredError ? (
            <p className="pg-publish-sheet-name-error" role="alert">
              {NAME_REQUIRED_ERROR}
            </p>
          ) : null}
        </label>
      ) : null}

      {neverPublished ? (
        <p className="pg-publish-sheet-section">{FIRST_PUBLISH}</p>
      ) : null}

      <div className="pg-publish-sheet-block">
        <h3>{SHARE_LINK_SECTION}</h3>
        <p>{NO_LINK_YET_PUBLISH}</p>
      </div>

      <div className="pg-publish-sheet-block">
        <h3>
          {LINK_EXPIRES_SECTION}{" "}
          <span className="pg-publish-sheet-muted">{THIS_PROGRAM_ONLY}</span>
        </h3>
        <div
          className="pg-publish-expiry-chips"
          role="radiogroup"
          aria-label={LINK_EXPIRES_SECTION}
        >
          {EXPIRY_ORDER.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={expiry === choice}
              className={`pg-publish-expiry-chip${
                expiry === choice ? " pg-publish-expiry-chip--active" : ""
              }${choice === SHARE_LINK_EXPIRES_IN.one_year ? " pg-publish-expiry-chip--default" : ""}`}
              onClick={() => {
                setExpiry(choice);
              }}
            >
              {
                SHARE_LINK_EXPIRY_CHOICE_LABELS[
                  choice as keyof typeof SHARE_LINK_EXPIRY_CHOICE_LABELS
                ]
              }
            </button>
          ))}
        </div>
      </div>
    </ConfirmSheet>
  );
}
