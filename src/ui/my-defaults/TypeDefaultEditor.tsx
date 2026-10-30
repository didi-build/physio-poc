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
  paramPhrase,
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

const PER_DAY_SELECT_OPTIONS: NumericOrRange[] = [
  1,
  2,
  3,
  { min: 1, max: 2 },
  { min: 1, max: 3 },
  { min: 2, max: 3 },
];

function perDayOptionValue(value: NumericOrRange): string {
  if (typeof value === "number") {
    return String(value);
  }
  return `${value.min}-${value.max}`;
}

function matchPerDayValue(value: NumericOrRange | undefined): string {
  if (value === undefined) {
    return "1-3";
  }
  const target = perDayOptionValue(value);
  const match = PER_DAY_SELECT_OPTIONS.find(
    (option) => perDayOptionValue(option) === target,
  );
  return match ? perDayOptionValue(match) : "1-3";
}

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
    return [...keys].filter((key) => draft[key] !== undefined);
  }, [type, addedKeys, draft]);

  const addable = addableTypeDefaultParams(
    type,
    mergeExerciseParams(draft, Object.fromEntries(addedKeys.map((k) => [k, draft[k]]))),
  );

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
    const option = PER_DAY_SELECT_OPTIONS.find(
      (entry) => perDayOptionValue(entry) === raw,
    );
    if (!option) {
      return;
    }
    setDraft((current) => ({ ...current, per_day: option }));
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
        {visibleKeys.map((key) =>
          key === "per_day" ? (
            <label key={key} className="md-param-field">
              <select
                className="md-param-input"
                aria-label={paramPhrase(
                  key,
                  draft.per_day ?? globalParams.per_day ?? { min: 1, max: 3 },
                )}
                value={matchPerDayValue(draft.per_day)}
                onChange={(event) => {
                  updatePerDay(event.target.value);
                }}
              >
                {PER_DAY_SELECT_OPTIONS.map((option) => (
                  <option
                    key={perDayOptionValue(option)}
                    value={perDayOptionValue(option)}
                  >
                    {formatExerciseParams({ per_day: option })}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label key={key} className="md-param-field">
              <input
                className="md-param-input"
                inputMode="numeric"
                aria-label={paramPhrase(
                  key,
                  draft[key] ?? globalParams[key] ?? PARAM_VALUE_BOUNDS[key].min,
                )}
                value={numericFieldValue(draft[key])}
                onChange={(event) => {
                  updateNumber(key, event.target.value);
                }}
              />
            </label>
          ),
        )}
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
