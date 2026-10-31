import type { ProgramBuilderRow } from "../../services/programs/types.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import {
  PLACEHOLDER_ROW_NOTE,
  duplicateRowAriaLabel,
  removeRowAriaLabel,
  reorderRowAriaLabel,
  ROW_NOTES_LABEL,
} from "../copy/programs.js";
import { TYPE_LABELS } from "../copy/my-defaults.js";

export type ProgramBuilderRowCardProps = {
  row: ProgramBuilderRow;
  index: number;
  total: number;
  noteDraft: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onNoteChange: (note: string) => void;
  onTypeChange: (type: PrescriptionType) => void;
  actionsDisabled?: boolean;
};

function RowGripIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <circle cx="9" cy="7" r="1.5" />
      <circle cx="15" cy="7" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="17" r="1.5" />
      <circle cx="15" cy="17" r="1.5" />
    </svg>
  );
}

function RowArrowUpIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 19V5M7 10l5-5 5 5" />
    </svg>
  );
}

function RowArrowDownIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 5v14M7 14l5 5 5-5" />
    </svg>
  );
}

function RowCopyIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="9" y="9" width="11" height="11" rx="1" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function RowTrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 12h10l1-12" />
    </svg>
  );
}

export function ProgramBuilderRowCard({
  row,
  index,
  total,
  noteDraft,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  onNoteChange,
  onTypeChange,
  actionsDisabled = false,
}: ProgramBuilderRowCardProps) {
  const title = row.text_snapshot.title;
  const titleId = `pg-row-title-${row.id}`;

  return (
    <article
      className="pg-row"
      aria-labelledby={titleId}
      tabIndex={0}
      onKeyDown={(event) => {
        if (actionsDisabled) {
          return;
        }
        if (event.key === "ArrowUp" && index > 0) {
          event.preventDefault();
          onMoveUp();
        }
        if (event.key === "ArrowDown" && index < total - 1) {
          event.preventDefault();
          onMoveDown();
        }
      }}
    >
      <div className="pg-row-header">
        <span className="pg-row-grip" aria-hidden>
          <RowGripIcon />
        </span>
        <div className="pg-row-title-wrap">
          <h3 id={titleId} className="pg-row-title">
            {title}
          </h3>
          {row.kind === "placeholder" ? (
            <p className="pg-row-placeholder-note">{PLACEHOLDER_ROW_NOTE}</p>
          ) : null}
        </div>
      </div>
      {row.kind === "exercise" ? (
        <>
          <select
            className="pg-row-type-select"
            value={row.prescription_type}
            disabled={actionsDisabled}
            onChange={(event) => {
              onTypeChange(event.target.value as PrescriptionType);
            }}
          >
            {PRESCRIPTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <p className="pg-row-readout" aria-labelledby={titleId}>
            {formatExerciseParams(row.params)}
          </p>
        </>
      ) : null}
      <label className="pg-row-notes">
        <span id={`pg-row-notes-label-${row.id}`}>{ROW_NOTES_LABEL}</span>
        <textarea
          aria-labelledby={`pg-row-notes-label-${row.id}`}
          value={noteDraft}
          onChange={(event) => {
            onNoteChange(event.target.value);
          }}
        />
      </label>
      <div className="pg-row-actions">
        <button
          type="button"
          className="pg-row-icon-btn"
          aria-label={reorderRowAriaLabel(title, index + 1)}
          disabled={actionsDisabled || index === 0}
          onClick={onMoveUp}
        >
          <RowArrowUpIcon />
        </button>
        <button
          type="button"
          className="pg-row-icon-btn"
          aria-label={reorderRowAriaLabel(title, index + 2)}
          disabled={actionsDisabled || index >= total - 1}
          onClick={onMoveDown}
        >
          <RowArrowDownIcon />
        </button>
        <button
          type="button"
          className="pg-row-icon-btn"
          aria-label={duplicateRowAriaLabel(title)}
          disabled={actionsDisabled || row.kind === "placeholder"}
          onClick={onDuplicate}
        >
          <RowCopyIcon />
        </button>
        <button
          type="button"
          className="pg-row-icon-btn"
          aria-label={removeRowAriaLabel(title)}
          disabled={actionsDisabled}
          onClick={onRemove}
        >
          <RowTrashIcon />
        </button>
      </div>
    </article>
  );
}
