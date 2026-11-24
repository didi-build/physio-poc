import { type RefObject, useId, useRef, useState, useCallback } from "react";
import { PositionThumbnail } from "./PositionThumbnail.js";
import { STARTING_POSITION } from "../copy/exercise-requests.js";
import {
  ADD_ENDING_POSITION,
  EDIT_ENDING_POSITION,
  ENDING_POSITION_EMPTY,
  ENDING_POSITION_LABEL,
  ENDING_POSITION_PLACEHOLDER,
  POSITIONS_HEADING,
  POSITIONS_HELPER,
  resetPositionFieldAriaLabel,
} from "../copy/ending-position.js";
import { CANCEL, SAVE, editFieldLabel } from "../copy/exercise-requests.js";
import {
  KEEP_MINE,
  LIBRARY_CHANGED,
  LIBRARY_NOW,
  RESET,
  TAG_EDITED,
  TAG_LIBRARY_UPDATED,
  USE_LIBRARY_VERSION,
} from "../copy/exercise-library.js";

export type PositionsCopyFieldMeta = {
  edited: boolean;
  libraryUpdated: boolean;
  libraryValue: string;
  onReset: () => void;
  onUseLibrary: () => void;
  onKeepMine: () => void;
};

export type ExercisePositionsCardProps = {
  startingPosition: string;
  endingPosition: string;
  startStillSrc?: string | null;
  endStillSrc?: string | null;
  showThumbnails: boolean;
  editable: boolean;
  showHelper: boolean;
  startingCopyMeta?: PositionsCopyFieldMeta;
  endingCopyMeta?: PositionsCopyFieldMeta;
  onSaveStarting?: (value: string) => Promise<void>;
  onSaveEnding?: (value: string) => Promise<void>;
};

type EditingField = "starting" | "ending" | null;

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
  describedBy,
  copyMeta,
  editButtonRef,
  onAfterCloseEdit,
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
  describedBy?: string;
  copyMeta?: PositionsCopyFieldMeta;
  editButtonRef: RefObject<HTMLButtonElement | null>;
  onAfterCloseEdit: () => void;
}) {
  const inputId = useId();
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
            aria-describedby={describedBy}
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
              void onSave(draft)
                .then(() => {
                  onCancel();
                  onAfterCloseEdit();
                })
                .catch(() => {
                  /* keep editor open with draft text */
                })
                .finally(() => {
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
              onAfterCloseEdit();
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
        <div className="ex-override-label-row">
          <span className="ex-draft-field-label">{label}</span>
          {copyMeta?.edited ? (
            <span className="ex-tag ex-tag--edited">{TAG_EDITED}</span>
          ) : null}
          {copyMeta?.libraryUpdated ? (
            <span className="ex-tag ex-tag--updated">{TAG_LIBRARY_UPDATED}</span>
          ) : null}
        </div>
        <div className="ex-draft-field-head-actions">
          {copyMeta?.edited && !copyMeta.libraryUpdated ? (
            <button
              type="button"
              className="ex-link-btn"
              aria-label={resetPositionFieldAriaLabel(label)}
              onClick={copyMeta.onReset}
            >
              {RESET}
            </button>
          ) : null}
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
      </div>
      <p className="ex-draft-field-value">{value || "\u00a0"}</p>
      {copyMeta?.libraryUpdated ? (
        <div className="ex-conflict-box">
          <p className="ex-conflict-title">{LIBRARY_CHANGED}</p>
          <p>
            {LIBRARY_NOW} {copyMeta.libraryValue}
          </p>
          <div className="ex-conflict-actions">
            <button
              type="button"
              className="ex-primary-btn"
              onClick={copyMeta.onUseLibrary}
            >
              {USE_LIBRARY_VERSION}
            </button>
            <button
              type="button"
              className="ex-secondary-btn"
              onClick={copyMeta.onKeepMine}
            >
              {KEEP_MINE}
            </button>
          </div>
        </div>
      ) : null}
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
  startingCopyMeta,
  endingCopyMeta,
  onSaveStarting,
  onSaveEnding,
}: ExercisePositionsCardProps) {
  const headingId = useId();
  const helperId = useId();
  const [editing, setEditing] = useState<EditingField>(null);
  const endingMissing = endingPosition.trim().length === 0;
  const showEndingEmpty = endingMissing && !editable && editing !== "ending";
  const showEndingEmptyEditable = endingMissing && editable && editing !== "ending";

  const startEditRef = useRef<HTMLButtonElement>(null);
  const endEditRef = useRef<HTMLButtonElement>(null);
  const focusStartEditLink = useCallback(() => {
    setTimeout(() => {
      startEditRef.current?.focus();
    }, 0);
  }, []);
  const focusEndEditLink = useCallback(() => {
    setTimeout(() => {
      endEditRef.current?.focus();
    }, 0);
  }, []);

  const startEditable = editable && onSaveStarting;
  const endEditable = editable && onSaveEnding;
  const [startThumbPresent, setStartThumbPresent] = useState(() =>
    Boolean(showThumbnails && startStillSrc),
  );
  const [endThumbPresent, setEndThumbPresent] = useState(() =>
    Boolean(showThumbnails && endStillSrc),
  );
  const onStartThumbPresence = useCallback((present: boolean) => {
    setStartThumbPresent(present);
  }, []);
  const onEndThumbPresence = useCallback((present: boolean) => {
    setEndThumbPresent(present);
  }, []);
  const helperDescribedBy = showHelper ? helperId : undefined;

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
      <ol className="ex-positions-steps">
        <li
          className={`ex-positions-step ex-positions-step--start${startThumbPresent ? "" : " ex-positions-step--no-thumb"}`}
        >
          <span
            className="ex-positions-marker ex-positions-marker--start"
            aria-hidden
          />
          <PositionThumbnail
            src={startStillSrc}
            show={showThumbnails}
            onPresenceChange={onStartThumbPresence}
          />
          {startEditable && editing === "starting" ? (
            <PositionStepBody
              label={STARTING_POSITION}
              value={startingPosition}
              editing
              multiline
              describedBy={helperDescribedBy}
              editLinkLabel={editFieldLabel(STARTING_POSITION)}
              copyMeta={startingCopyMeta}
              editButtonRef={startEditRef}
              onAfterCloseEdit={focusStartEditLink}
              onBeginEdit={() => {
                setEditing("starting");
              }}
              onSave={onSaveStarting!}
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
              copyMeta={startingCopyMeta}
              editButtonRef={startEditRef}
              onAfterCloseEdit={focusStartEditLink}
              onBeginEdit={() => {
                setEditing("starting");
              }}
              onSave={onSaveStarting!}
              onCancel={() => {
                setEditing(null);
              }}
            />
          ) : (
            <p className="ex-draft-field-value">{startingPosition || "\u00a0"}</p>
          )}
        </li>
        <li
          className={`ex-positions-step ex-positions-step--end${endThumbPresent ? "" : " ex-positions-step--no-thumb"}`}
        >
          <span className="ex-positions-marker ex-positions-marker--end" aria-hidden />
          <PositionThumbnail
            src={endStillSrc}
            show={showThumbnails}
            onPresenceChange={onEndThumbPresence}
          />
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
              describedBy={helperDescribedBy}
              editLinkLabel={EDIT_ENDING_POSITION}
              copyMeta={endingCopyMeta}
              editButtonRef={endEditRef}
              onAfterCloseEdit={focusEndEditLink}
              onBeginEdit={() => {
                setEditing("ending");
              }}
              onSave={onSaveEnding!}
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
              copyMeta={endingCopyMeta}
              editButtonRef={endEditRef}
              onAfterCloseEdit={focusEndEditLink}
              onBeginEdit={() => {
                setEditing("ending");
              }}
              onSave={onSaveEnding!}
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
