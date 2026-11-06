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
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import { mergeExerciseParams } from "../../domain/exercise-params.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../domain/global-type-defaults-seed.js";
import { ADD_PARAMETER, READS_AS } from "../copy/my-defaults.js";
import { DONE_ADJUSTING } from "../copy/programs.js";
import {
  approvedPerDayOptions,
  matchApprovedPerDayOptionValue,
  perDayValueHasApprovedLabel,
} from "../my-defaults/type-default-editor-options.js";
import { doseParamAriaLabelledBy } from "../my-defaults/type-default-editor-a11y.js";

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
  current: ExerciseParams,
): ExerciseParams {
  const seed = { ...GLOBAL_TYPE_DEFAULTS_SEED[type], ...current };
  return { ...seed };
}

export type ProgramRowParamEditorProps = {
  rowId: string;
  type: PrescriptionType;
  params: ExerciseParams;
  onDone: (params: ExerciseParams) => void;
};

export function ProgramRowParamEditor({
  rowId,
  type,
  params,
  onDone,
}: ProgramRowParamEditorProps) {
  const typeTitleId = `pg-row-dose-editor-type-${rowId}`;
  const globalParams = GLOBAL_TYPE_DEFAULTS_SEED[type];
  const [draft, setDraft] = useState<ExerciseParams>(() =>
    buildInitialDraft(type, params),
  );
  const [addedKeys, setAddedKeys] = useState<ParamKey[]>(() =>
    TYPE_DEFAULT_ADDABLE_PARAMS.filter(
      (key) =>
        draft[key] !== undefined && !TYPE_DEFAULT_CORE_PARAMS[type].includes(key),
    ),
  );

  const visibleKeys = useMemo(() => {
    const keys = new Set<ParamKey>([...TYPE_DEFAULT_CORE_PARAMS[type], ...addedKeys]);
    return [...keys].filter((key) => !UI_HIDDEN_PARAM_KEYS.has(key));
  }, [type, addedKeys]);

  const addable = addableTypeDefaultParams(
    type,
    mergeExerciseParams(draft, Object.fromEntries(addedKeys.map((k) => [k, draft[k]]))),
  );

  const perDayOptions = approvedPerDayOptions();
  const perDayUsesApprovedSelect =
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

  const updatePerDaySelect = (raw: string) => {
    const option = perDayOptions.find((entry) => entry.optionValue === raw);
    if (!option) {
      return;
    }
    setDraft((current) => ({ ...current, per_day: option.value }));
  };

  const updatePerDayScalar = (raw: string) => {
    const parsed = parseNumericField("per_day", raw);
    setDraft((current) => {
      const next = { ...current };
      if (parsed === null) {
        delete next.per_day;
      } else {
        next.per_day = parsed;
      }
      return next;
    });
  };

  const addParam = (key: ParamKey) => {
    setAddedKeys((current) => (current.includes(key) ? current : [...current, key]));
    setDraft((current) => ({
      ...current,
      [key]: globalParams[key] ?? PARAM_VALUE_BOUNDS[key].min,
    }));
  };

  return (
    <div className="pg-row-dose-editor">
      <span id={typeTitleId} className="sr-only">
        {type}
      </span>
      <div className="pg-row-dose-editor-grid md-param-grid">
        {visibleKeys.map((key) => {
          const labelledBy = doseParamAriaLabelledBy(typeTitleId, key);
          if (key === "per_day") {
            if (perDayUsesApprovedSelect) {
              return (
                <label key={key} className="md-param-field">
                  <select
                    className="md-param-input"
                    aria-labelledby={labelledBy}
                    value={matchApprovedPerDayOptionValue(draft.per_day)}
                    onChange={(event) => {
                      updatePerDaySelect(event.target.value);
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
            return (
              <label key={key} className="md-param-field">
                <input
                  className="md-param-input"
                  inputMode="numeric"
                  aria-labelledby={labelledBy}
                  value={numericFieldValue(
                    typeof draft.per_day === "number" ? draft.per_day : undefined,
                  )}
                  onChange={(event) => {
                    updatePerDayScalar(event.target.value);
                  }}
                />
              </label>
            );
          }

          return (
            <label key={key} className="md-param-field">
              <input
                className="md-param-input"
                inputMode="numeric"
                aria-labelledby={labelledBy}
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
      <div className="md-reads-as pg-row-dose-editor-reads-as">
        <span className="md-reads-as-label">{READS_AS}</span>{" "}
        {formatExerciseParams(draft)}
      </div>
      <div className="pg-row-dose-editor-done">
        <button
          type="button"
          className="pg-btn pg-btn--primary pg-row-dose-editor-done-btn"
          onClick={() => {
            onDone(draft);
          }}
        >
          {DONE_ADJUSTING}
        </button>
      </div>
    </div>
  );
}
