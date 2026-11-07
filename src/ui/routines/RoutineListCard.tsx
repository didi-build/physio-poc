import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type {
  CommunityRoutineSummary,
  MyRoutineDraftItem,
  MyRoutineSavedItem,
} from "../../services/routines/types.js";
import {
  ADDED_BY_YOU,
  communityUpdatedToVersion,
  DRAFT_SAVED_NOTE,
  exerciseCountLine,
  savedOn,
  TAG_DRAFT,
  TAG_EDITED,
  UNTITLED_ROUTINE,
  usedOn,
  usedTimes,
  versionN,
  yourCopyVersion,
  inMyRoutinesLabel,
  saveRoutineLabel,
} from "../copy/routines.js";
import { formatListDate } from "../exercise-library/library-filters.js";

export type RoutineListCardProps =
  | {
      mode: "all";
      item: CommunityRoutineSummary;
      conditionsAvailable: boolean;
      onSave?: () => void;
    }
  | {
      mode: "mine-saved";
      item: MyRoutineSavedItem;
      conditionsAvailable: boolean;
    }
  | {
      mode: "mine-draft";
      item: MyRoutineDraftItem;
      conditionsAvailable: boolean;
      onOpen: () => void;
    };

function metaLine(
  conditionLabel: string | null,
  bodyRegion: string,
  conditionsAvailable: boolean,
): string {
  if (conditionsAvailable && conditionLabel) {
    return `${conditionLabel} · ${bodyRegion}`;
  }
  return bodyRegion;
}

export function RoutineListCard(props: RoutineListCardProps) {
  const conditionsAvailable = props.conditionsAvailable;
  if (props.mode === "all") {
    const { item, onSave } = props;
    const name = item.name;
    return (
      <li className={`rt-card${item.in_my_routines ? " rt-card--saved" : ""}`}>
        <Link
          to={fillPhysioAppRoutePattern("routineDetail", {
            routineId: item.routine_id,
          })}
          className="rt-card-main"
        >
          <div className="rt-card-thumbs" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="rt-card-body">
            <h3 className="rt-card-title">{name}</h3>
            <p className="rt-card-meta">
              {metaLine(
                item.condition_label,
                item.body_region_label,
                conditionsAvailable,
              )}
            </p>
            <p className="rt-card-submeta">
              {exerciseCountLine(item.exercise_count, versionN(item.version_number))}
            </p>
            <div className="rt-card-tags">
              <span>{usedTimes(item.usage_count)}</span>
              {item.added_by_you ? (
                <span className="rt-card-you">{ADDED_BY_YOU}</span>
              ) : null}
            </div>
          </div>
        </Link>
        <button
          type="button"
          className={`rt-save-btn${item.in_my_routines ? " rt-save-btn--active" : ""}`}
          aria-label={
            item.in_my_routines ? inMyRoutinesLabel(name) : saveRoutineLabel(name)
          }
          aria-pressed={item.in_my_routines}
          onClick={() => {
            onSave?.();
          }}
        >
          {item.in_my_routines ? "✓" : "+"}
        </button>
      </li>
    );
  }

  if (props.mode === "mine-draft") {
    const { item, onOpen } = props;
    const title = item.name?.trim() ? item.name : UNTITLED_ROUTINE;
    return (
      <li className="rt-card rt-card--draft">
        <button
          type="button"
          className="rt-card-main rt-card-main--button"
          onClick={onOpen}
        >
          <div className="rt-card-thumbs rt-card-thumbs--draft" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="rt-card-body">
            <h3 className={`rt-card-title${!item.name ? " rt-card-title--muted" : ""}`}>
              {title}
            </h3>
            <p className="rt-card-meta">
              {metaLine(
                item.condition_label,
                item.body_region_label,
                conditionsAvailable,
              )}
            </p>
            <div className="rt-card-tags">
              <span className="rt-tag rt-tag--draft">{TAG_DRAFT}</span>
              <span>{DRAFT_SAVED_NOTE}</span>
            </div>
          </div>
        </button>
      </li>
    );
  }

  const { item } = props;
  const dateLine = item.last_used_at
    ? usedOn(formatListDate(item.last_used_at))
    : savedOn(formatListDate(item.saved_at));
  return (
    <li className={`rt-card${item.community_updated ? " rt-card--flagged" : ""}`}>
      <Link
        to={fillPhysioAppRoutePattern("routineDetail", { routineId: item.routine_id })}
        className="rt-card-main"
      >
        <div className="rt-card-thumbs" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="rt-card-body">
          <h3 className="rt-card-title">{item.name}</h3>
          <p className="rt-card-meta">
            {metaLine(
              item.condition_label,
              item.body_region_label,
              conditionsAvailable,
            )}
          </p>
          <p className="rt-card-submeta">
            {exerciseCountLine(
              item.exercise_count,
              yourCopyVersion(item.saved_copy_version),
            )}
          </p>
          <div className="rt-card-tags">
            {item.community_updated && item.community_version !== null ? (
              <span className="rt-tag rt-tag--flag">
                {communityUpdatedToVersion(item.community_version)}
              </span>
            ) : null}
            {item.edited ? (
              <span className="rt-tag rt-tag--edited">{TAG_EDITED}</span>
            ) : null}
            <span>{dateLine}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
