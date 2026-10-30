import { useMemo, useState } from "react";
import type {
  ParamKey,
  ExerciseParams,
  NumericOrRange,
} from "../../domain/exercise-params.js";
import { PARAM_VALUE_BOUNDS } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import {
  TYPE_DEFAULT_ADDABLE_PARAMS,
  TYPE_DEFAULT_CORE_PARAMS,
  addableTypeDefaultParams,
} from "../../domain/type-default-param-layout.js";
import {
  formatExerciseParams,
  paramAccessibleName,
} from "../../domain/format-exercise-params.js";
import { mergeExerciseParams } from "../../domain/exercise-params.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../domain/global-type-defaults-seed.js";
import {
  ADD_PARAMETER,
  CANCEL,
  GLOBAL_PREFIX,
  READS_AS,
  SAVE,
} from "../copy/my-defaults.js";
import {
  approvedPerDayOptions,
  matchApprovedPerDayOptionValue,
  perDayValueHasApprovedLabel,
} from "./type-default-editor-options.js";

/** Stored and saved, but no approved readout or field labels on mock 01 or 02. */
const UI_HIDDEN_PARAM_KEYS = new Set<ParamKey>(["ascent_s"]);

function numericFieldValue(value: NumericOrRange | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

function parseNumericField(key: ParamKey, raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const bounds = PARAM_VALUE_BOUNDS[key];
  if (bounds.integer && !Number.isInteger(parsed)) {
    return null;
  }
  if (parsed < bounds.min || parsed > bounds.max) {
    return null;
  }
  return parsed;
}

function buildInitialDraft(
  type: PrescriptionType,
  own: ExerciseParams | null,
): ExerciseParams {
  const seed = own ?? GLOBAL_TYPE_DEFAULTS_SEED[type];
  return { ...seed };
}

export type TypeDefaultEditorProps = {
  type: PrescriptionType;
  own: ExerciseParams | null;
  onSave: (params: ExerciseParams) => void;
  onCancel: () => void;
};

export function TypeDefaultEditor({
  type,
  own,
  onSave,
  onCancel,
}: TypeDefaultEditorProps) {
  const globalParams = GLOBAL_TYPE_DEFAULTS_SEED[type];
  const [draft, setDraft] = useState<ExerciseParams>(() =>
    buildInitialDraft(type, own),
  );
  const [addedKeys, setAddedKeys] = useState<ParamKey[]>(() =>
    TYPE_DEFAULT_ADDABLE_PARAMS.filter(
      (key) =>
        draft[key] !== undefined && !TYPE_DEFAULT_CORE_PARAMS[type].includes(key),
    ),
  );

  const visibleKeys = useMemo(() => {
    const keys = new Set<ParamKey>([...TYPE_DEFAULT_CORE_PARAMS[type], ...addedKeys]);
    return [...keys].filter(
      (key) => draft[key] !== undefined && !UI_HIDDEN_PARAM_KEYS.has(key),
    );
  }, [type, addedKeys, draft]);

  const addable = addableTypeDefaultParams(
    type,
    mergeExerciseParams(draft, Object.fromEntries(addedKeys.map((k) => [k, draft[k]]))),
  );

  const perDayOptions = approvedPerDayOptions();
  const showPerDayField =
    visibleKeys.includes("per_day") &&
    perDayOptions.length > 0 &&
    perDayValueHasApprovedLabel(draft.per_day);

  const updateNumber = (key: ParamKey, raw: string) => {
    const parsed = parseNumericField(key, raw);
    setDraft((current) => {
      const next = { ...current };
      if (parsed === null) {
        delete next[key];
      } else {
        next[key] = parsed;
      }
      return next;
    });
  };

  const updatePerDay = (raw: string) => {
    const option = perDayOptions.find((entry) => entry.optionValue === raw);
    if (!option) {
      return;
    }
    setDraft((current) => ({ ...current, per_day: option.value }));
  };

  const addParam = (key: ParamKey) => {
    setAddedKeys((current) => (current.includes(key) ? current : [...current, key]));
    setDraft((current) => ({
      ...current,
      [key]: globalParams[key] ?? PARAM_VALUE_BOUNDS[key].min,
    }));
  };

  return (
    <div className="md-type-edit">
      <p className="md-type-global-ref">
        {GLOBAL_PREFIX} {formatExerciseParams(globalParams)}
      </p>
      <div className="md-param-grid">
        {visibleKeys.map((key) => {
          if (key === "per_day") {
            if (!showPerDayField) {
              return null;
            }
            const selectLabel = paramAccessibleName(
              "per_day",
              draft.per_day,
              globalParams.per_day ?? { min: 1, max: 3 },
            );
            if (!selectLabel) {
              return null;
            }
            return (
              <label key={key} className="md-param-field">
                <select
                  className="md-param-input"
                  aria-label={selectLabel}
                  value={matchApprovedPerDayOptionValue(draft.per_day)}
                  onChange={(event) => {
                    updatePerDay(event.target.value);
                  }}
                >
                  {perDayOptions.map((option) => (
                    <option key={option.optionValue} value={option.optionValue}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          const inputLabel = paramAccessibleName(
            key,
            draft[key],
            globalParams[key] ?? PARAM_VALUE_BOUNDS[key].min,
          );
          if (!inputLabel) {
            return null;
          }

          return (
            <label key={key} className="md-param-field">
              <input
                className="md-param-input"
                inputMode="numeric"
                aria-label={inputLabel}
                value={numericFieldValue(draft[key])}
                onChange={(event) => {
                  updateNumber(key, event.target.value);
                }}
              />
            </label>
          );
        })}
      </div>
      {addable.length > 0 ? (
        <div className="md-add-param-row">
          <button
            type="button"
            className="md-btn md-btn--ghost"
            onClick={() => {
              addParam(addable[0]!);
            }}
          >
            {ADD_PARAMETER}
          </button>
        </div>
      ) : null}
      <div className="md-reads-as">
        <span className="md-reads-as-label">{READS_AS}</span>{" "}
        {formatExerciseParams(draft)}
      </div>
      <div className="md-type-edit-actions">
        <button
          type="button"
          className="md-btn md-btn--primary"
          onClick={() => {
            onSave(draft);
          }}
        >
          {SAVE}
        </button>
        <button type="button" className="md-btn md-btn--secondary" onClick={onCancel}>
          {CANCEL}
        </button>
      </div>
    </div>
  );
}
