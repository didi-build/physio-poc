import type { ProgramBuilderRow } from "../../services/programs/types.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import {
  DUPLICATE,
  PLACEHOLDER_ROW_NOTE,
  ROW_NOTES_LABEL,
  TIMES_PER_DAY,
  duplicateRowAriaLabel,
  removeRowAriaLabel,
  reorderRowAriaLabel,
} from "../copy/programs.js";
import { TYPE_LABELS } from "../copy/my-defaults.js";
import { ProgramRowVersionPicker } from "./ProgramRowVersionPicker.js";

export type ProgramBuilderRowCardProps = {
  row: ProgramBuilderRow;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onNoteChange: (note: string) => void;
  onTypeChange: (type: PrescriptionType) => void;
  busy?: boolean;
};

export function ProgramBuilderRowCard({
  row,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  onNoteChange,
  onTypeChange,
  busy = false,
}: ProgramBuilderRowCardProps) {
  const title =
    row.kind === "placeholder" ? PLACEHOLDER_ROW_NOTE : row.text_snapshot.title;
  const titleId = `pg-row-title-${row.id}`;

  return (
    <article
      className="pg-row"
      aria-labelledby={titleId}
      tabIndex={0}
      onKeyDown={(event) => {
        if (busy) {
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
      <ProgramRowVersionPicker />
      <h3 id={titleId} className="pg-row-title">
        {title}
      </h3>
      {row.kind === "exercise" ? (
        <>
          <label className="pg-row-type-label">
            <span id={`pg-row-type-label-${row.id}`}>
              {TYPE_LABELS[row.prescription_type]}
            </span>
            <select
              className="pg-row-type-select"
              aria-labelledby={`pg-row-type-label-${row.id}`}
              value={row.prescription_type}
              disabled={busy}
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
          </label>
          <p className="pg-row-readout" aria-labelledby={titleId}>
            {formatExerciseParams(row.params)}
          </p>
          {row.params.per_day !== undefined ? (
            <p className="pg-row-dose">
              <span id={`pg-row-per-day-${row.id}`}>{TIMES_PER_DAY}</span>
              <span aria-labelledby={`pg-row-per-day-${row.id} ${titleId}`}>
                {typeof row.params.per_day === "number"
                  ? String(row.params.per_day)
                  : `${row.params.per_day.min}-${row.params.per_day.max}`}
              </span>
            </p>
          ) : null}
        </>
      ) : null}
      <label className="pg-row-notes">
        <span id={`pg-row-notes-label-${row.id}`}>{ROW_NOTES_LABEL}</span>
        <textarea
          aria-labelledby={`pg-row-notes-label-${row.id}`}
          value={row.note ?? ""}
          disabled={busy}
          onChange={(event) => {
            onNoteChange(event.target.value);
          }}
        />
      </label>
      <div className="pg-row-actions">
        <button
          type="button"
          className="pg-row-reorder pg-sr-only-focusable"
          aria-label={reorderRowAriaLabel(title, index + 1)}
          disabled={busy || index === 0}
          onClick={onMoveUp}
        />
        <button
          type="button"
          className="pg-row-reorder pg-sr-only-focusable"
          aria-label={reorderRowAriaLabel(title, index + 2)}
          disabled={busy || index >= total - 1}
          onClick={onMoveDown}
        />
        <button
          type="button"
          aria-label={duplicateRowAriaLabel(title)}
          disabled={busy || row.kind === "placeholder"}
          onClick={onDuplicate}
        >
          {DUPLICATE}
        </button>
        <button
          type="button"
          aria-label={removeRowAriaLabel(title)}
          disabled={busy}
          onClick={onRemove}
        />
      </div>
    </article>
  );
}
