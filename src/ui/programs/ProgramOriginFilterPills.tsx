import {
  FILTER_ALL_PROGRAMS,
  FILTER_FROM_ROUTINE,
  FILTER_FROM_SCRATCH,
} from "../copy/programs.js";

export type ProgramOriginFilter = "all" | "from_routine" | "from_scratch";

export type ProgramOriginFilterPillsProps = {
  active: ProgramOriginFilter;
  onSelect: (filter: ProgramOriginFilter) => void;
};

/** Built for DIDI-1141; not mounted until list API supports origin filter (DIDI-1140). */
export function ProgramOriginFilterPills({
  active,
  onSelect,
}: ProgramOriginFilterPillsProps) {
  return (
    <div className="pg-origin-filters" role="group">
      <button
        type="button"
        className={`pg-origin-filter${active === "all" ? " pg-origin-filter--active" : ""}`}
        aria-pressed={active === "all"}
        onClick={() => {
          onSelect("all");
        }}
      >
        {FILTER_ALL_PROGRAMS}
      </button>
      <button
        type="button"
        className={`pg-origin-filter${active === "from_routine" ? " pg-origin-filter--active" : ""}`}
        aria-pressed={active === "from_routine"}
        onClick={() => {
          onSelect("from_routine");
        }}
      >
        {FILTER_FROM_ROUTINE}
      </button>
      <button
        type="button"
        className={`pg-origin-filter${active === "from_scratch" ? " pg-origin-filter--active" : ""}`}
        aria-pressed={active === "from_scratch"}
        onClick={() => {
          onSelect("from_scratch");
        }}
      >
        {FILTER_FROM_SCRATCH}
      </button>
    </div>
  );
}
