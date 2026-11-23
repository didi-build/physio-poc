import { useId, useRef, useState } from "react";
import { STARTING_POSITION } from "../copy/exercise-requests.js";
import {
  ADD_ENDING_POSITION,
  EDIT_ENDING_POSITION,
  ENDING_POSITION_EMPTY,
  ENDING_POSITION_LABEL,
  ENDING_POSITION_PLACEHOLDER,
  POSITIONS_HEADING,
  POSITIONS_HELPER,
} from "../copy/ending-position.js";
import { CANCEL, SAVE, editFieldLabel } from "../copy/exercise-requests.js";

export type ExercisePositionsCardProps = {
  variant: "draft" | "library";
  startingPosition: string;
  endingPosition: string;
  startStillSrc?: string | null;
  endStillSrc?: string | null;
  showThumbnails: boolean;
  editable: boolean;
  showHelper: boolean;
  onSaveStarting?: (value: string) => Promise<void>;
  onSaveEnding?: (value: string) => Promise<void>;
};

type EditingField = "starting" | "ending" | null;

function PositionThumbnail({ src, show }: { src?: string | null; show: boolean }) {
  if (!show || !src) {
    return null;
  }
  return <img src={src} alt="" className="ex-positions-thumb" width={56} height={56} />;
}

function PositionStepBody({
  label,
  value,
  editing,
  multiline,
  placeholder,
  editLinkLabel,
  onBeginEdit,
  onSave,
  onCancel,
}: {
  label: string;
  value: string;
  editing: boolean;
  multiline: boolean;
  placeholder?: string;
  editLinkLabel: string;
  onBeginEdit: () => void;
  onSave: (next: string) => Promise<void>;
  onCancel: () => void;
}) {
  const inputId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <div className="ex-positions-step-body ex-positions-step-body--editing">
        <label className="ex-draft-field-label" htmlFor={inputId}>
          {label}
        </label>
        {multiline ? (
          <textarea
            id={inputId}
            className="ex-textarea"
            rows={4}
            value={draft}
            placeholder={placeholder}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            ref={(node) => {
              if (node) {
                node.focus();
              }
            }}
          />
        ) : (
          <input
            id={inputId}
            className="ex-input"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
        )}
        <div className="ex-draft-field-actions">
          <button
            type="button"
            className="ex-primary-btn"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onSave(draft).finally(() => {
                setSaving(false);
              });
            }}
          >
            {SAVE}
          </button>
          <button
            type="button"
            className="ex-secondary-btn"
            disabled={saving}
            onClick={() => {
              setDraft(value);
              onCancel();
              editButtonRef.current?.focus();
            }}
          >
            {CANCEL}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ex-positions-step-body">
      <div className="ex-draft-field-head">
        <span className="ex-draft-field-label">{label}</span>
        <button
          type="button"
          className="ex-link-btn"
          ref={editButtonRef}
          aria-label={editLinkLabel}
          onClick={onBeginEdit}
        >
          {editLinkLabel}
        </button>
      </div>
      <p className="ex-draft-field-value">{value || "\u00a0"}</p>
    </div>
  );
}

export function ExercisePositionsCard({
  startingPosition,
  endingPosition,
  startStillSrc,
  endStillSrc,
  showThumbnails,
  editable,
  showHelper,
  onSaveStarting,
  onSaveEnding,
}: ExercisePositionsCardProps) {
  const headingId = useId();
  const helperId = useId();
  const [editing, setEditing] = useState<EditingField>(null);
  const endingMissing = endingPosition.trim().length === 0;
  const showEndingEmpty = endingMissing && !editable && editing !== "ending";
  const showEndingEmptyEditable = endingMissing && editable && editing !== "ending";

  const startEditable = editable && onSaveStarting;
  const endEditable = editable && onSaveEnding;

  return (
    <section
      className="ex-positions-card"
      aria-labelledby={headingId}
      data-testid="exercise-positions-card"
    >
      <h3 id={headingId} className="ex-positions-card-heading">
        {POSITIONS_HEADING}
      </h3>
      {showHelper ? (
        <p id={helperId} className="ex-positions-helper">
          {POSITIONS_HELPER}
        </p>
      ) : null}
      <ol className="ex-positions-steps" aria-label={POSITIONS_HEADING}>
        <li className="ex-positions-step ex-positions-step--start">
          <span
            className="ex-positions-marker ex-positions-marker--start"
            aria-hidden
          />
          <PositionThumbnail src={startStillSrc} show={showThumbnails} />
          {startEditable && editing === "starting" ? (
            <PositionStepBody
              label={STARTING_POSITION}
              value={startingPosition}
              editing
              multiline
              editLinkLabel={editFieldLabel(STARTING_POSITION)}
              onBeginEdit={() => {
                setEditing("starting");
              }}
              onSave={onSaveStarting}
              onCancel={() => {
                setEditing(null);
              }}
            />
          ) : startEditable ? (
            <PositionStepBody
              label={STARTING_POSITION}
              value={startingPosition}
              editing={false}
              multiline
              editLinkLabel={editFieldLabel(STARTING_POSITION)}
              onBeginEdit={() => {
                setEditing("starting");
              }}
              onSave={onSaveStarting}
              onCancel={() => {
                setEditing(null);
              }}
            />
          ) : (
            <p className="ex-draft-field-value">{startingPosition || "\u00a0"}</p>
          )}
        </li>
        <li className="ex-positions-step ex-positions-step--end">
          <span className="ex-positions-marker ex-positions-marker--end" aria-hidden />
          <PositionThumbnail src={endStillSrc} show={showThumbnails} />
          {showEndingEmpty ? (
            <p className="ex-positions-empty">{ENDING_POSITION_EMPTY}</p>
          ) : showEndingEmptyEditable ? (
            <div className="ex-positions-empty-block">
              <p className="ex-positions-empty">{ENDING_POSITION_EMPTY}</p>
              <button
                type="button"
                className="ex-link-btn ex-positions-add"
                onClick={() => {
                  setEditing("ending");
                }}
              >
                {ADD_ENDING_POSITION}
              </button>
            </div>
          ) : endEditable && editing === "ending" ? (
            <PositionStepBody
              label={ENDING_POSITION_LABEL}
              value={endingPosition}
              editing
              multiline
              placeholder={ENDING_POSITION_PLACEHOLDER}
              editLinkLabel={EDIT_ENDING_POSITION}
              onBeginEdit={() => {
                setEditing("ending");
              }}
              onSave={onSaveEnding}
              onCancel={() => {
                setEditing(null);
              }}
            />
          ) : endEditable ? (
            <PositionStepBody
              label={ENDING_POSITION_LABEL}
              value={endingPosition}
              editing={false}
              multiline
              placeholder={ENDING_POSITION_PLACEHOLDER}
              editLinkLabel={EDIT_ENDING_POSITION}
              onBeginEdit={() => {
                setEditing("ending");
              }}
              onSave={onSaveEnding}
              onCancel={() => {
                setEditing(null);
              }}
            />
          ) : endingMissing ? null : (
            <p className="ex-draft-field-value">{endingPosition}</p>
          )}
        </li>
      </ol>
    </section>
  );
}
