import { useId, useMemo, useState } from "react";
import {
  ALL_CONDITIONS,
  BODY_REGION,
  CLEAR,
  CONDITION,
  CONDITION_SAMPLE_LIST,
  CONDITION_SAMPLE_NOTE,
  DONE,
  FILTERS_HEADER,
  RESET,
  SORT,
  SORT_A_TO_Z,
  SORT_MOST_USED,
  SORT_NEWEST,
} from "../copy/routines.js";
import {
  countRoutineActiveFilters,
  DEFAULT_ROUTINE_FILTERS,
  ROUTINE_BODY_REGION_PILLS,
  routineFilterSummary,
  type RoutineLibraryFilters,
} from "./routine-library-filters.js";

const SORT_OPTIONS = [
  { id: "most_used" as const, label: SORT_MOST_USED },
  { id: "newest" as const, label: SORT_NEWEST },
  { id: "a_to_z" as const, label: SORT_A_TO_Z },
];

export type ConditionOption = {
  condition_id: string;
  label: string;
};

export type RoutinesFiltersSortPanelProps = {
  filters: RoutineLibraryFilters;
  onChange: (next: RoutineLibraryFilters) => void;
  conditionsAvailable: boolean;
  conditionOptions: readonly ConditionOption[];
};

export function RoutinesFiltersSortPanel({
  filters,
  onChange,
  conditionsAvailable,
  conditionOptions,
}: RoutinesFiltersSortPanelProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const conditionLabels = useMemo(
    () => new Map(conditionOptions.map((opt) => [opt.condition_id, opt.label])),
    [conditionOptions],
  );
  const active = countRoutineActiveFilters(filters, conditionsAvailable);

  return (
    <div className="ex-filters-wrap">
      <button
        type="button"
        className="ex-filters-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span className="ex-filters-trigger-title">
          {FILTERS_HEADER}
          {active > 0 ? (
            <span className="ex-filters-count" aria-label={`${active} active`}>
              {active}
            </span>
          ) : null}
        </span>
        {!open ? (
          <span className="ex-filters-summary">
            {routineFilterSummary(filters, conditionsAvailable, conditionLabels)}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id={panelId} className="ex-filters-panel">
          {conditionsAvailable ? (
            <div>
              <div className="ex-field-label-row">
                <span className="ex-field-label" id={`${panelId}-cond`}>
                  {CONDITION}
                </span>
                <span className="ex-sample-pill">{CONDITION_SAMPLE_LIST}</span>
              </div>
              <div
                className="ex-pill-row"
                role="group"
                aria-labelledby={`${panelId}-cond`}
              >
                <button
                  type="button"
                  className={`ex-pill${filters.conditionId === null ? " ex-pill--active" : ""}`}
                  aria-pressed={filters.conditionId === null}
                  onClick={() => {
                    onChange({ ...filters, conditionId: null });
                  }}
                >
                  {ALL_CONDITIONS}
                </button>
                {conditionOptions.map((option) => (
                  <button
                    key={option.condition_id}
                    type="button"
                    className={`ex-pill${filters.conditionId === option.condition_id ? " ex-pill--active" : ""}`}
                    aria-pressed={filters.conditionId === option.condition_id}
                    onClick={() => {
                      onChange({ ...filters, conditionId: option.condition_id });
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="ex-field-note">{CONDITION_SAMPLE_NOTE}</p>
            </div>
          ) : null}
          <div>
            <div className="ex-field-label" id={`${panelId}-region`}>
              {BODY_REGION}
            </div>
            <div
              className="ex-pill-row"
              role="group"
              aria-labelledby={`${panelId}-region`}
            >
              {ROUTINE_BODY_REGION_PILLS.map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  className={`ex-pill${filters.bodyRegion === pill.value ? " ex-pill--active" : ""}`}
                  aria-pressed={filters.bodyRegion === pill.value}
                  onClick={() => {
                    onChange({ ...filters, bodyRegion: pill.value });
                  }}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="ex-field-label" id={`${panelId}-sort`}>
              {SORT}
            </div>
            <div
              className="ex-sort-row"
              role="radiogroup"
              aria-labelledby={`${panelId}-sort`}
            >
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={filters.sort === option.id}
                  className={`ex-sort-option${filters.sort === option.id ? " ex-sort-option--active" : ""}`}
                  onClick={() => {
                    onChange({ ...filters, sort: option.id });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ex-filters-actions">
            <button
              type="button"
              className="ex-link-btn"
              disabled={active === 0 && filters.sort === DEFAULT_ROUTINE_FILTERS.sort}
              onClick={() => {
                onChange(DEFAULT_ROUTINE_FILTERS);
              }}
            >
              {RESET}
            </button>
            <button
              type="button"
              className="ex-secondary-btn"
              onClick={() => {
                setOpen(false);
              }}
            >
              {DONE}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type RoutinesSearchBarProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  label: string;
};

export function RoutinesSearchBar({
  value,
  placeholder,
  onChange,
  label,
}: RoutinesSearchBarProps) {
  return (
    <div className="ex-search-wrap">
      <label htmlFor="rt-search" className="sr-only">
        {label}
      </label>
      <input
        id="rt-search"
        type="search"
        enterKeyHint="search"
        className="ex-search-input"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {value ? (
        <button
          type="button"
          className="ex-search-clear"
          onClick={() => {
            onChange("");
          }}
        >
          {CLEAR}
        </button>
      ) : null}
    </div>
  );
}
