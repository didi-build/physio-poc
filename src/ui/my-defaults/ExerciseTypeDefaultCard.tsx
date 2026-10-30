import { useState } from "react";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { MyDefaultsExerciseTypeView } from "../../services/my-defaults/types.js";
import {
  GLOBAL_DEFAULT_IN_USE,
  GLOBAL_PREFIX,
  RESET_TO_GLOBAL,
  TYPE_LABELS,
  YOUR_DEFAULT_BADGE,
  YOUR_DEFAULT_HEADING,
  editYourTypeDefaultLabel,
  setYourOwnTypeDefaultLabel,
} from "../copy/my-defaults.js";
import { typeDefaultEditorTypeTitleId } from "./type-default-editor-a11y.js";
import { TypeDefaultEditor } from "./TypeDefaultEditor.js";

export type ExerciseTypeDefaultCardProps = {
  entry: MyDefaultsExerciseTypeView;
  onSave: (type: PrescriptionType, params: ExerciseParams) => void;
  onReset: (type: PrescriptionType) => void;
};

export function ExerciseTypeDefaultCard({
  entry,
  onSave,
  onReset,
}: ExerciseTypeDefaultCardProps) {
  const [editing, setEditing] = useState(false);
  const typeLabel = TYPE_LABELS[entry.type];
  const own = entry.practitioner_params;
  const globalFormatted = formatExerciseParams(entry.global_params);

  return (
    <li
      className={`md-type-card${editing ? " md-type-card--editing" : ""}`}
      data-testid={`type-default-${entry.type}`}
    >
      <div className="md-type-card-head">
        <div className="md-type-card-titles">
          <div className="md-type-card-title-row">
            <h2
              className="md-type-card-title"
              id={typeDefaultEditorTypeTitleId(entry.type)}
            >
              {typeLabel}
            </h2>
          </div>
        </div>
        {own && !editing ? (
          <span className="md-badge md-badge--teal">{YOUR_DEFAULT_BADGE}</span>
        ) : null}
      </div>

      {!editing ? (
        <>
          {own ? (
            <div className="md-type-own-box">
              <div className="md-type-box-label">{YOUR_DEFAULT_HEADING}</div>
              <div className="md-type-box-value">{formatExerciseParams(own)}</div>
              <div className="md-type-box-global">
                {GLOBAL_PREFIX} {globalFormatted}
              </div>
            </div>
          ) : (
            <div className="md-type-global-box">
              <div className="md-type-box-label">{GLOBAL_DEFAULT_IN_USE}</div>
              <div className="md-type-box-value">{globalFormatted}</div>
            </div>
          )}
          <div className="md-type-card-actions">
            <button
              type="button"
              className="md-btn md-btn--secondary md-btn--grow"
              onClick={() => {
                setEditing(true);
              }}
            >
              {own
                ? editYourTypeDefaultLabel(typeLabel)
                : setYourOwnTypeDefaultLabel(typeLabel)}
            </button>
            {own ? (
              <button
                type="button"
                className="md-btn md-btn--ghost md-btn--grow"
                onClick={() => {
                  onReset(entry.type);
                }}
              >
                {RESET_TO_GLOBAL}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <TypeDefaultEditor
          type={entry.type}
          typeTitleId={typeDefaultEditorTypeTitleId(entry.type)}
          own={own}
          onSave={(params) => {
            onSave(entry.type, params);
            setEditing(false);
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}
