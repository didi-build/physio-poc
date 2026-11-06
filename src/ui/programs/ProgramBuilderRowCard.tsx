import { useState } from "react";
import type { ProgramBuilderRow } from "../../services/programs/types.js";
import {
  exerciseParamsEqual,
  type ExerciseParams,
} from "../../domain/exercise-params.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import type { ResolvedParamsSource } from "../../domain/resolve-exercise-params.js";
import {
  prescriptionTypesForCategory,
  type PrescriptionType,
} from "../../domain/exercise-types.js";
import {
  ADJUST,
  DOSE_ADJUST_TOGGLE_DONE,
  DOSE_CHANGED_FOR_THIS_ROW_ONLY,
  DOSE_EDITED_BADGE,
  DUPLICATE_CONTROL_TITLE,
  DONE_ADJUSTING,
  PENDING_REVIEW_BADGE,
  PLACEHOLDER_ROW_NOTE,
  PROGRAM_ROW_SOURCE_FROM_GLOBAL_DEFAULTS,
  PROGRAM_ROW_SOURCE_FROM_MY_DEFAULTS,
  PROGRAM_ROW_SOURCE_FROM_MY_EXERCISE,
  RESET_TO_DEFAULT,
  ROW_NOTES_PLACEHOLDER,
  duplicateRowAriaLabel,
  libraryVersionAvailableRowBadge,
  removeRowAriaLabel,
  rowNotesSrOnlyLabel,
  versionOfRowLabel,
} from "../copy/programs.js";
import { TYPE_LABELS } from "../copy/my-defaults.js";
import { ProgramRowParamEditor } from "./ProgramRowParamEditor.js";
import { ProgramRowVersionPicker } from "./ProgramRowVersionPicker.js";
import {
  exerciseVersionIdForNumber,
  versionNumbersForRow,
} from "./program-row-version.js";

const STRENGTH_TYPES = prescriptionTypesForCategory("strengthening");

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
  onSelectVersion: (versionNumber: number) => void;
  onParamsChange: (params: ExerciseParams) => void;
  onParamsReset: () => void;
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

function RowCopyIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="9" y="9" width="11" height="11" rx="1" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function RowSlidersIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M9 21h-1M15 15h1M18 21h1" />
    </svg>
  );
}

function RowUndoIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M3 7v6h6M21 17a9 9 0 0 0-15-6l-3 3" />
    </svg>
  );
}

function RowTrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 12h10l1-12" />
    </svg>
  );
}

function StretchCategoryIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="pg-row-cat-icon"
    >
      <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />
    </svg>
  );
}

function StrengthCategoryIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="pg-row-cat-icon"
    >
      <path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" />
    </svg>
  );
}

function rowStripeClass(row: ProgramBuilderRow): string {
  if (row.kind === "placeholder") {
    return "pg-row--stripe-pending";
  }
  return row.prescription_type === "stretching"
    ? "pg-row--stripe-sky"
    : "pg-row--stripe-violet";
}

function rowCategoryKind(row: ProgramBuilderRow): "stretch" | "strength" {
  return row.prescription_type === "stretching" ? "stretch" : "strength";
}

function programRowSourceNoteLabel(source: ResolvedParamsSource): string {
  if (source === "exercise_override") {
    return PROGRAM_ROW_SOURCE_FROM_MY_EXERCISE;
  }
  if (source === "practitioner_defaults") {
    return PROGRAM_ROW_SOURCE_FROM_MY_DEFAULTS;
  }
  return PROGRAM_ROW_SOURCE_FROM_GLOBAL_DEFAULTS;
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
  onSelectVersion,
  onParamsChange,
  onParamsReset,
  actionsDisabled = false,
}: ProgramBuilderRowCardProps) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const title = row.text_snapshot.title;
  const titleId = `pg-row-title-${row.id}`;
  const versionOptions = versionNumbersForRow(row);
  const selectedVersionNumber = row.pinned_version_number ?? versionOptions[0] ?? 1;
  const kind = rowCategoryKind(row);
  const doseEdited = !exerciseParamsEqual(row.params, row.resolved_params);
  const sourceForNote: ResolvedParamsSource =
    row.params_source !== null ? row.params_source : row.resolved_params_source;
  const adjustLabel = `${adjustOpen ? DONE_ADJUSTING : ADJUST} ${title}`;
  const doseBoxClass =
    doseEdited || adjustOpen
      ? "pg-row-dose-box pg-row-dose-box--edited"
      : "pg-row-dose-box";

  return (
    <article
      className={`pg-row ${rowStripeClass(row)}`}
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
        <div className="pg-row-title-block">
          <h3 id={titleId} className="pg-row-title">
            {title}
          </h3>
          {row.kind === "placeholder" ? (
            <p className="pg-row-meta-line">
              <span className="pg-row-badge pg-row-badge--amber">
                {PENDING_REVIEW_BADGE}
              </span>
            </p>
          ) : (
            <p
              className={`pg-row-meta-line pg-row-cat-line ${
                kind === "stretch"
                  ? "pg-row-cat-line--stretch"
                  : "pg-row-cat-line--strength"
              }`}
            >
              {kind === "stretch" ? <StretchCategoryIcon /> : <StrengthCategoryIcon />}
              <span className="pg-row-cat-label">
                {TYPE_LABELS[row.prescription_type]}
              </span>
            </p>
          )}
          {row.library_update !== null ? (
            <p className="pg-row-meta-line">
              <span className="pg-row-badge pg-row-badge--teal">
                {libraryVersionAvailableRowBadge(
                  row.library_update.latest_version_number,
                )}
              </span>
            </p>
          ) : null}
        </div>
        <div className="pg-row-header-actions">
          <button
            type="button"
            className="pg-row-header-icon-btn"
            title={DUPLICATE_CONTROL_TITLE}
            aria-label={duplicateRowAriaLabel(title)}
            disabled={actionsDisabled || row.kind === "placeholder"}
            onClick={onDuplicate}
          >
            <RowCopyIcon />
          </button>
          <button
            type="button"
            className="pg-row-header-icon-btn"
            aria-label={removeRowAriaLabel(title)}
            disabled={actionsDisabled}
            onClick={onRemove}
          >
            <RowTrashIcon />
          </button>
        </div>
      </div>
      {row.kind === "placeholder" ? (
        <p className="pg-row-placeholder-note pg-row-placeholder-note--below-header">
          {PLACEHOLDER_ROW_NOTE}
        </p>
      ) : null}
      <>
        {row.prescription_type !== "stretching" ? (
          <div
            className="pg-row-type-segmented"
            role="radiogroup"
            aria-label={versionOfRowLabel(title)}
          >
            {STRENGTH_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={row.prescription_type === type}
                className={
                  row.prescription_type === type
                    ? "pg-row-type-segment pg-row-type-segment--active"
                    : "pg-row-type-segment"
                }
                disabled={actionsDisabled}
                onClick={() => {
                  onTypeChange(type);
                }}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        ) : null}
        <div className={doseBoxClass}>
          <div className="pg-row-dose-head">
            <p className="pg-row-dose-text">{formatExerciseParams(row.params)}</p>
            <button
              type="button"
              className="pg-row-dose-adjust"
              aria-expanded={adjustOpen}
              aria-label={adjustLabel}
              disabled={actionsDisabled}
              onClick={() => {
                setAdjustOpen((open) => !open);
              }}
            >
              {!adjustOpen ? (
                <>
                  <RowSlidersIcon />
                  {ADJUST}
                </>
              ) : (
                DOSE_ADJUST_TOGGLE_DONE
              )}
            </button>
          </div>
          <div className="pg-row-dose-meta">
            {doseEdited ? (
              <>
                <span className="pg-row-dose-badge">{DOSE_EDITED_BADGE}</span>
                <span className="pg-row-dose-scope">
                  {DOSE_CHANGED_FOR_THIS_ROW_ONLY}
                </span>
                <button
                  type="button"
                  className="pg-row-dose-reset"
                  disabled={actionsDisabled}
                  onClick={() => {
                    setAdjustOpen(false);
                    onParamsReset();
                  }}
                >
                  <RowUndoIcon />
                  {RESET_TO_DEFAULT}
                </button>
              </>
            ) : (
              <span
                className={
                  sourceForNote === "global_defaults"
                    ? "pg-row-dose-source pg-row-dose-source--global"
                    : "pg-row-dose-source"
                }
              >
                <span className="pg-row-dose-source-dot" aria-hidden />
                {programRowSourceNoteLabel(sourceForNote)}
              </span>
            )}
          </div>
          {doseEdited ? (
            <p className="pg-row-dose-default-line">
              {programRowSourceNoteLabel(row.resolved_params_source)}:{" "}
              {formatExerciseParams(row.resolved_params)}
            </p>
          ) : null}
        </div>
        {adjustOpen ? (
          <div className="pg-row-dose-editor-wrap">
            <ProgramRowParamEditor
              rowId={row.id}
              type={row.prescription_type}
              params={row.params}
              onDone={(next) => {
                setAdjustOpen(false);
                onParamsChange(next);
              }}
            />
          </div>
        ) : null}
        {row.kind === "exercise" && versionOptions.length > 0 ? (
          <ProgramRowVersionPicker
            rowName={title}
            selectedVersionNumber={selectedVersionNumber}
            versionOptions={versionOptions}
            onSelectVersion={(versionNumber) => {
              if (actionsDisabled) {
                return;
              }
              if (
                exerciseVersionIdForNumber(row, versionNumber) ===
                row.exercise_version_id
              ) {
                return;
              }
              onSelectVersion(versionNumber);
            }}
          />
        ) : null}
      </>
      <label className="pg-row-notes">
        <span className="sr-only">{rowNotesSrOnlyLabel(title)}</span>
        <input
          type="text"
          className="pg-row-notes-input"
          placeholder={ROW_NOTES_PLACEHOLDER}
          aria-label={rowNotesSrOnlyLabel(title)}
          value={noteDraft}
          onChange={(event) => {
            onNoteChange(event.target.value);
          }}
        />
      </label>
    </article>
  );
}
