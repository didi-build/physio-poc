import { useState } from "react";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { prescriptionTypesForCategory } from "../../domain/exercise-types.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../domain/global-type-defaults-seed.js";
import type { ExerciseParams } from "../../domain/exercise-params.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import type { RoutineExerciseRow } from "../../services/routines/types.js";
import {
  EXERCISES_HEADING,
  moveExerciseDownAria,
  moveExerciseUpAria,
  removeExerciseAria,
  typeForExerciseAria,
} from "../copy/routines.js";
import { TYPE_LABELS } from "../copy/my-defaults.js";
import { ADJUST, DONE_ADJUSTING } from "../copy/programs.js";
import { ProgramRowParamEditor } from "../programs/ProgramRowParamEditor.js";

export type RoutineAuthoringExerciseListProps = {
  rows: RoutineExerciseRow[];
  onChange: (rows: RoutineExerciseRow[]) => void;
};

function strengthTypes(): PrescriptionType[] {
  return [...prescriptionTypesForCategory("strengthening")];
}

export function RoutineAuthoringExerciseList({
  rows,
  onChange,
}: RoutineAuthoringExerciseListProps) {
  const [doseOpenIndex, setDoseOpenIndex] = useState<number | null>(null);

  const updateRow = (index: number, patch: Partial<RoutineExerciseRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) {
      return;
    }
    const next = [...rows];
    const [item] = next.splice(from, 1);
    if (!item) {
      return;
    }
    next.splice(to, 0, item);
    onChange(next.map((row, position) => ({ ...row, position })));
  };

  const remove = (index: number) => {
    onChange(
      rows.filter((_, i) => i !== index).map((row, position) => ({ ...row, position })),
    );
  };

  return (
    <section
      className="rt-authoring-exercises"
      aria-labelledby="rt-authoring-exercises"
    >
      <div className="rt-exercises-header">
        <h2 id="rt-authoring-exercises">{EXERCISES_HEADING}</h2>
      </div>
      <ul className="rt-authoring-exercise-list">
        {rows.map((row, index) => {
          const types =
            row.prescription_type === "stretching"
              ? (["stretching"] as PrescriptionType[])
              : strengthTypes();
          const doseOpen = doseOpenIndex === index;
          return (
            <li
              key={`${row.exercise_id}-${index}`}
              className="rt-authoring-exercise-item"
            >
              <div className="rt-authoring-exercise-main">
                <span className="rt-exercise-pos">{index + 1}</span>
                <div className="rt-authoring-exercise-body">
                  <p className="rt-authoring-exercise-name">{row.exercise_name}</p>
                  <label className="sr-only" htmlFor={`rt-type-${index}`}>
                    {typeForExerciseAria(row.exercise_name)}
                  </label>
                  <select
                    id={`rt-type-${index}`}
                    className="rt-type-chip rt-type-select"
                    value={row.prescription_type}
                    onChange={(event) => {
                      const nextType = event.target.value as PrescriptionType;
                      updateRow(index, {
                        prescription_type: nextType,
                        params: { ...GLOBAL_TYPE_DEFAULTS_SEED[nextType] },
                      });
                    }}
                  >
                    {types.map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABELS[type] ?? type}
                      </option>
                    ))}
                  </select>
                  <p className="ex-muted">{formatExerciseParams(row.params)}</p>
                </div>
                <div className="rt-authoring-exercise-actions">
                  <button
                    type="button"
                    className="ex-link-btn"
                    disabled={index === 0}
                    aria-label={moveExerciseUpAria(row.exercise_name)}
                    onClick={() => {
                      move(index, index - 1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="ex-link-btn"
                    disabled={index === rows.length - 1}
                    aria-label={moveExerciseDownAria(row.exercise_name)}
                    onClick={() => {
                      move(index, index + 1);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="ex-link-btn"
                    aria-label={removeExerciseAria(row.exercise_name)}
                    onClick={() => {
                      remove(index);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="ex-secondary-btn"
                onClick={() => {
                  setDoseOpenIndex(doseOpen ? null : index);
                }}
              >
                {doseOpen ? DONE_ADJUSTING : ADJUST}
              </button>
              {doseOpen ? (
                <ProgramRowParamEditor
                  rowId={`rt-row-${index}`}
                  type={row.prescription_type}
                  params={row.params}
                  onChange={(params: ExerciseParams) => {
                    updateRow(index, { params });
                  }}
                  onClose={() => {
                    setDoseOpenIndex(null);
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
