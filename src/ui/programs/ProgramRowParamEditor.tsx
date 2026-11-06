import { useMemo, useState } from "react";
import type {
  ParamKey,
  ExerciseParams,
  NumericOrRange,
} from "../../domain/exercise-params.js";
import { PARAM_VALUE_BOUNDS } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import {
  TYPE_DEFAULT_CORE_PARAMS,
  addableProgramRowDoseParams,
} from "../../domain/type-default-param-layout.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import { ADD_PARAMETER, CANCEL, READS_AS } from "../copy/my-defaults.js";
import { DONE_ADJUSTING } from "../copy/programs.js";

const PARAM_STEPPER_HEADLINE: Record<
  ParamKey,
  { label: string; short?: string; unitSeconds?: boolean }
> = {
  reps: { label: "Reps" },
  sets: { label: "Sets" },
  hold_s: { label: "Hold", short: "Hold", unitSeconds: true },
  ascent_s: { label: "Up", short: "Up", unitSeconds: true },
  descent_s: { label: "Down", short: "Down", unitSeconds: true },
  rest_s: { label: "Rest between sets", short: "Rest", unitSeconds: true },
  per_day: { label: "Times per day", short: "Times per day" },
  days_per_week: { label: "Days per week", short: "Days per week" },
};

/** Aligned to v12 `PER_DAY_OPTIONS` order for stretching (1, 2, 3, ranges). */
const STRETCH_PER_DAY_SEQUENCE: NumericOrRange[] = [
  1,
  2,
  3,
  { min: 1, max: 2 },
  { min: 1, max: 3 },
  { min: 2, max: 3 },
];

const ADD_PARAM_START: Partial<Record<ParamKey, number>> = {
  ascent_s: 2,
  descent_s: 3,
  rest_s: 60,
};

function perDayRangeKey(value: NumericOrRange): string {
  if (typeof value === "number") {
    return `n:${value}`;
  }
  return `r:${value.min}-${value.max}`;
}

function perDayRangesEqual(a: NumericOrRange, b: NumericOrRange): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return a === b;
  }
  if (typeof a === "object" && typeof b === "object") {
    return a.min === b.min && a.max === b.max;
  }
  return false;
}

function stretchPerDaySequenceIndex(value: NumericOrRange): number {
  const idx = STRETCH_PER_DAY_SEQUENCE.findIndex((opt) => {
    if (typeof opt === "number" && typeof value === "number") {
      return opt === value;
    }
    if (typeof opt === "object" && typeof value === "object") {
      return perDayRangesEqual(opt, value);
    }
    return false;
  });
  return idx < 0 ? 0 : idx;
}

function stepSizeForKey(key: ParamKey, current: number): number {
  if (key === "rest_s") {
    return 15;
  }
  if (key === "hold_s" && current >= 10) {
    return 5;
  }
  return 1;
}

function headlineForKey(key: ParamKey): string {
  const m = PARAM_STEPPER_HEADLINE[key];
  const base = (m.short ?? m.label).toUpperCase();
  return m.unitSeconds ? `${base} (s)` : base;
}

function centerDisplayValue(key: ParamKey, value: NumericOrRange): string {
  if (key === "per_day") {
    if (typeof value === "number") {
      return String(value);
    }
    return `${value.min} to ${value.max}`;
  }
  if (
    key === "hold_s" ||
    key === "ascent_s" ||
    key === "descent_s" ||
    key === "rest_s"
  ) {
    const n = value as number;
    return `${n}s`;
  }
  const n = value as number;
  if (key === "days_per_week" && n === 7) {
    return "Every day";
  }
  return String(n);
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export type ProgramRowParamEditorProps = {
  rowId: string;
  type: PrescriptionType;
  params: ExerciseParams;
  onChange: (params: ExerciseParams) => void;
  onClose: () => void;
};

export function ProgramRowParamEditor({
  rowId,
  type,
  params,
  onChange,
  onClose,
}: ProgramRowParamEditorProps) {
  const typeTitleId = `pg-row-dose-editor-type-${rowId}`;
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const visibleKeyList = useMemo(() => {
    const inDraft = new Set(
      (Object.keys(params) as ParamKey[]).filter((k) => params[k] !== undefined),
    );
    return (
      [
        "reps",
        "hold_s",
        "ascent_s",
        "descent_s",
        "sets",
        "rest_s",
        "per_day",
        "days_per_week",
      ] as const
    ).filter((k) => inDraft.has(k));
  }, [params]);

  const addable = addableProgramRowDoseParams(type, params);

  const stepNumeric = (key: ParamKey, deltaSteps: number) => {
    const bounds = PARAM_VALUE_BOUNDS[key];
    const raw = params[key];
    if (raw === undefined || typeof raw !== "number") {
      return;
    }
    const step = stepSizeForKey(key, raw);
    const next = clampInt(raw + deltaSteps * step, bounds.min, bounds.max);
    onChange({ ...params, [key]: next });
  };

  const stepPerDayStretch = (delta: number) => {
    const raw = params.per_day;
    if (raw === undefined) {
      return;
    }
    const i = stretchPerDaySequenceIndex(raw);
    const nextI = clampInt(i + delta, 0, STRETCH_PER_DAY_SEQUENCE.length - 1);
    onChange({ ...params, per_day: STRETCH_PER_DAY_SEQUENCE[nextI]! });
  };

  const atMin = (key: ParamKey): boolean => {
    const raw = params[key];
    if (raw === undefined) {
      return true;
    }
    if (key === "per_day") {
      if (type !== "stretching") {
        return true;
      }
      return stretchPerDaySequenceIndex(raw) <= 0;
    }
    if (typeof raw !== "number") {
      return true;
    }
    return raw <= PARAM_VALUE_BOUNDS[key].min;
  };

  const atMax = (key: ParamKey): boolean => {
    const raw = params[key];
    if (raw === undefined) {
      return true;
    }
    if (key === "per_day") {
      if (type !== "stretching") {
        return true;
      }
      return stretchPerDaySequenceIndex(raw) >= STRETCH_PER_DAY_SEQUENCE.length - 1;
    }
    if (typeof raw !== "number") {
      return true;
    }
    return raw >= PARAM_VALUE_BOUNDS[key].max;
  };

  const addParam = (key: ParamKey) => {
    const start = ADD_PARAM_START[key] ?? PARAM_VALUE_BOUNDS[key].min;
    onChange({ ...params, [key]: start });
    setAddMenuOpen(false);
  };

  const removeKey = (key: ParamKey) => {
    if (TYPE_DEFAULT_CORE_PARAMS[type].includes(key)) {
      return;
    }
    const next = { ...params };
    delete next[key];
    onChange(next);
  };

  return (
    <div className="pg-row-dose-editor">
      <span id={typeTitleId} className="sr-only">
        {type}
      </span>
      <div className="pg-row-dose-stepper-grid">
        {visibleKeyList.map((key) => {
          const value = params[key];
          if (value === undefined) {
            return null;
          }
          const m = PARAM_STEPPER_HEADLINE[key];
          const removeAllowed = !TYPE_DEFAULT_CORE_PARAMS[type].includes(key);
          const lessLabel = `Less ${m.label.toLowerCase()}`;
          const moreLabel = `More ${m.label.toLowerCase()}`;
          const removeLabel = `Remove ${m.label.toLowerCase()}`;

          if (key === "per_day" && type === "stretching") {
            return (
              <div
                key={`${key}-${perDayRangeKey(value)}`}
                className="pg-row-dose-stepper"
              >
                <div className="pg-row-dose-stepper-head">
                  <span
                    className="pg-row-dose-stepper-title"
                    id={`pg-dose-${rowId}-per_day`}
                  >
                    {headlineForKey(key)}
                  </span>
                  {removeAllowed ? (
                    <button
                      type="button"
                      className="pg-row-dose-stepper-remove"
                      aria-label={removeLabel}
                      onClick={() => {
                        removeKey(key);
                      }}
                    >
                      x
                    </button>
                  ) : null}
                </div>
                <div className="pg-row-dose-stepper-bar">
                  <button
                    type="button"
                    className="pg-row-dose-stepper-btn"
                    aria-label={lessLabel}
                    disabled={atMin(key)}
                    onClick={() => {
                      stepPerDayStretch(-1);
                    }}
                  >
                    -
                  </button>
                  <span
                    className="pg-row-dose-stepper-value"
                    aria-live="polite"
                    aria-labelledby={`pg-dose-${rowId}-per_day`}
                  >
                    {centerDisplayValue(key, value)}
                  </span>
                  <button
                    type="button"
                    className="pg-row-dose-stepper-btn"
                    aria-label={moreLabel}
                    disabled={atMax(key)}
                    onClick={() => {
                      stepPerDayStretch(1);
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          }

          if (typeof value !== "number") {
            return null;
          }

          return (
            <div key={key} className="pg-row-dose-stepper">
              <div className="pg-row-dose-stepper-head">
                <span
                  className="pg-row-dose-stepper-title"
                  id={`pg-dose-${rowId}-${key}`}
                >
                  {headlineForKey(key)}
                </span>
                {removeAllowed ? (
                  <button
                    type="button"
                    className="pg-row-dose-stepper-remove"
                    aria-label={removeLabel}
                    onClick={() => {
                      removeKey(key);
                    }}
                  >
                    x
                  </button>
                ) : null}
              </div>
              <div className="pg-row-dose-stepper-bar">
                <button
                  type="button"
                  className="pg-row-dose-stepper-btn"
                  aria-label={lessLabel}
                  disabled={atMin(key)}
                  onClick={() => {
                    stepNumeric(key, -1);
                  }}
                >
                  -
                </button>
                <span
                  className="pg-row-dose-stepper-value"
                  aria-live="polite"
                  aria-labelledby={`pg-dose-${rowId}-${key}`}
                >
                  {centerDisplayValue(key, value)}
                </span>
                <button
                  type="button"
                  className="pg-row-dose-stepper-btn"
                  aria-label={moreLabel}
                  disabled={atMax(key)}
                  onClick={() => {
                    stepNumeric(key, 1);
                  }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {addable.length > 0 ? (
        <div className="pg-row-dose-add-param">
          {!addMenuOpen ? (
            <button
              type="button"
              className="pg-row-dose-add-param-open"
              onClick={() => {
                setAddMenuOpen(true);
              }}
            >
              {ADD_PARAMETER}
            </button>
          ) : (
            <div
              className="pg-row-dose-add-param-menu"
              role="group"
              aria-label={ADD_PARAMETER}
            >
              <div className="pg-row-dose-add-param-menu-title">{ADD_PARAMETER}</div>
              <div className="pg-row-dose-add-param-chips">
                {addable.map((key) => {
                  const meta = PARAM_STEPPER_HEADLINE[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className="pg-row-dose-add-param-chip"
                      onClick={() => {
                        addParam(key);
                      }}
                    >
                      {meta.label}
                      {meta.unitSeconds ? " (s)" : ""}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="pg-row-dose-add-param-cancel"
                  onClick={() => {
                    setAddMenuOpen(false);
                  }}
                >
                  {CANCEL}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      <div className="md-reads-as pg-row-dose-editor-reads-as">
        <span className="md-reads-as-label">{READS_AS}</span>{" "}
        {formatExerciseParams(params)}
      </div>
      <div className="pg-row-dose-editor-done">
        <button
          type="button"
          className="pg-btn pg-btn--primary pg-row-dose-editor-done-btn"
          onClick={() => {
            onClose();
          }}
        >
          {DONE_ADJUSTING}
        </button>
      </div>
    </div>
  );
}
