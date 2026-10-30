import { Link } from "react-router-dom";
import { exerciseDetailsPath } from "../../app-routes.js";
import {
  MATCHED_ALIAS_PREFIX,
  SAVED_PREFIX,
  TAG_EDITED,
  TAG_LIBRARY_UPDATED,
  TAG_NEW,
  USED_PREFIX,
} from "../copy/exercise-library.js";
import { formatListDate } from "./library-filters.js";

export type ExerciseCardModel = {
  exercise_id: string;
  exercise_name: string;
  category: "Stretching" | "Strengthening";
  body_regions: string[];
  matched_alias: string | null;
  usage_count?: number;
  edited?: boolean;
  library_updated?: boolean;
  favourite?: boolean;
  saved_at?: string;
  last_used_at?: string | null;
  is_new?: boolean;
  in_my_exercises?: boolean;
};

export type ExerciseListCardProps = {
  item: ExerciseCardModel;
  mode: "mine" | "all";
  onSave?: () => void;
  onTogglePin?: () => void;
};

function formatRegions(regions: string[]): string {
  return regions
    .map((region) => region.charAt(0).toUpperCase() + region.slice(1))
    .join(", ");
}

function usageLine(item: ExerciseCardModel): string | null {
  if (item.last_used_at) {
    return `${USED_PREFIX} ${formatListDate(item.last_used_at)}`;
  }
  if (item.saved_at) {
    return `${SAVED_PREFIX} ${formatListDate(item.saved_at)}`;
  }
  return null;
}

export function ExerciseListCard({
  item,
  mode,
  onSave,
  onTogglePin,
}: ExerciseListCardProps) {
  const line = usageLine(item);
  return (
    <li className="ex-card">
      <Link to={exerciseDetailsPath(item.exercise_id)} className="ex-card-main">
        <div className="ex-card-thumb" aria-hidden />
        <div className="ex-card-body">
          <div className="ex-card-title-row">
            <span className="ex-card-title">{item.exercise_name}</span>
            {item.is_new ? <span className="ex-tag ex-tag--new">{TAG_NEW}</span> : null}
          </div>
          <div className="ex-card-meta">
            {formatRegions(item.body_regions)}
            {line ? <> · {line}</> : null}
          </div>
          {item.matched_alias ? (
            <div className="ex-card-alias">
              {MATCHED_ALIAS_PREFIX} {item.matched_alias}
            </div>
          ) : null}
          {mode === "all" && item.usage_count !== undefined ? (
            <div className="ex-card-usage">Used {item.usage_count} times</div>
          ) : null}
          <div className="ex-card-tags">
            {item.edited ? (
              <span className="ex-tag ex-tag--edited">{TAG_EDITED}</span>
            ) : null}
            {item.library_updated ? (
              <span className="ex-tag ex-tag--updated">{TAG_LIBRARY_UPDATED}</span>
            ) : null}
          </div>
        </div>
      </Link>
      <div className="ex-card-actions">
        <span className="ex-card-category">{item.category}</span>
        {mode === "mine" && onTogglePin ? (
          <button
            type="button"
            className={`ex-icon-btn${item.favourite ? " ex-icon-btn--active" : ""}`}
            aria-pressed={item.favourite}
            aria-label={
              item.favourite
                ? `Unpin ${item.exercise_name}`
                : `Pin ${item.exercise_name}`
            }
            onClick={(event) => {
              event.preventDefault();
              onTogglePin();
            }}
          >
            Pin
          </button>
        ) : null}
        {mode === "all" && !item.in_my_exercises && onSave ? (
          <button
            type="button"
            className="ex-icon-btn"
            aria-label={`Save ${item.exercise_name} to My exercises`}
            onClick={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            Save
          </button>
        ) : null}
      </div>
    </li>
  );
}
