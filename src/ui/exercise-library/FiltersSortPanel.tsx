import { useId, useState } from "react";
import {
  BODY_REGION,
  CLEAR,
  CLOSE_TYPE_LIST,
  DONE,
  FILTERS_HEADER,
  RESET,
  SORT,
  SORT_A_TO_Z,
  SORT_MOST_USED,
  SORT_NEWEST,
  TYPE,
  TYPE_BOTH_HINT,
  TYPE_BOTH_LABEL,
  TYPE_STRENGTH_HINT,
  TYPE_STRENGTH_LABEL,
  TYPE_STRETCH_HINT,
  TYPE_STRETCH_LABEL,
} from "../copy/exercise-library.js";
import {
  BODY_REGION_PILLS,
  countActiveFilters,
  filterSummary,
  type LibraryFilters,
  type TypeFilterChoice,
} from "./library-filters.js";

const TYPE_CHOICES: {
  id: TypeFilterChoice;
  label: string;
  hint: string;
}[] = [
  { id: "both", label: TYPE_BOTH_LABEL, hint: TYPE_BOTH_HINT },
  { id: "Strengthening", label: TYPE_STRENGTH_LABEL, hint: TYPE_STRENGTH_HINT },
  { id: "Stretching", label: TYPE_STRETCH_LABEL, hint: TYPE_STRETCH_HINT },
];

const SORT_OPTIONS = [
  { id: "most_used" as const, label: SORT_MOST_USED },
  { id: "newest" as const, label: SORT_NEWEST },
  { id: "a_to_z" as const, label: SORT_A_TO_Z },
];

export type FiltersSortPanelProps = {
  filters: LibraryFilters;
  onChange: (next: LibraryFilters) => void;
};

export function FiltersSortPanel({ filters, onChange }: FiltersSortPanelProps) {
  const [open, setOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const panelId = useId();
  const active = countActiveFilters(filters);
  const typeChoice =
    TYPE_CHOICES.find((choice) => choice.id === filters.typeChoice) ?? TYPE_CHOICES[0];

  return (
    <div className="ex-filters-wrap">
      <button
        type="button"
        className="ex-filters-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
          setTypeOpen(false);
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
          <span className="ex-filters-summary">{filterSummary(filters)}</span>
        ) : null}
      </button>
      {open ? (
        <div id={panelId} className="ex-filters-panel">
          <div>
            <div className="ex-field-label" id={`${panelId}-region`}>
              {BODY_REGION}
            </div>
            <div
              className="ex-pill-row"
              role="group"
              aria-labelledby={`${panelId}-region`}
            >
              {BODY_REGION_PILLS.map((pill) => (
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
          <div className="ex-type-dropdown">
            <div className="ex-field-label" id={`${panelId}-type`}>
              {TYPE}
            </div>
            <button
              type="button"
              className={`ex-type-trigger${typeOpen ? " ex-type-trigger--open" : ""}`}
              aria-haspopup="listbox"
              aria-expanded={typeOpen}
              aria-labelledby={`${panelId}-type ${panelId}-type-val`}
              onClick={() => {
                setTypeOpen((value) => !value);
              }}
            >
              <span id={`${panelId}-type-val`} className="ex-type-trigger-text">
                <span className="ex-type-trigger-label">{typeChoice.label}</span>
                <span className="ex-type-trigger-hint">{typeChoice.hint}</span>
              </span>
            </button>
            {typeOpen ? (
              <>
                <button
                  type="button"
                  className="ex-type-backdrop"
                  aria-label={CLOSE_TYPE_LIST}
                  tabIndex={-1}
                  onClick={() => {
                    setTypeOpen(false);
                  }}
                />
                <ul
                  role="listbox"
                  aria-labelledby={`${panelId}-type`}
                  className="ex-type-list"
                >
                  {TYPE_CHOICES.map((choice) => (
                    <li
                      key={choice.id}
                      role="option"
                      aria-selected={filters.typeChoice === choice.id}
                    >
                      <button
                        type="button"
                        className={`ex-type-option${filters.typeChoice === choice.id ? " ex-type-option--active" : ""}`}
                        onClick={() => {
                          onChange({ ...filters, typeChoice: choice.id });
                          setTypeOpen(false);
                        }}
                      >
                        <span>
                          <span className="ex-type-trigger-label">{choice.label}</span>
                          <span className="ex-type-trigger-hint">{choice.hint}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
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
              disabled={active === 0 && filters.sort === "most_used"}
              onClick={() => {
                onChange({
                  bodyRegion: null,
                  typeChoice: "both",
                  sort: "most_used",
                });
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

export type LibrarySearchBarProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  label: string;
};

export function LibrarySearchBar({
  value,
  placeholder,
  onChange,
  label,
}: LibrarySearchBarProps) {
  return (
    <div className="ex-search-wrap">
      <label htmlFor="ex-search" className="sr-only">
        {label}
      </label>
      <input
        id="ex-search"
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
