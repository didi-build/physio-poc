import { ConfirmSheet } from "../components/ConfirmSheet.js";
import type { RoutineExerciseRow } from "../../services/routines/types.js";
import {
  NOT_YET,
  NOT_YET_KEEPS_DRAFT,
  PUBLISH_NOW,
  PUBLISH_POINT_LIVE_V1,
  PUBLISH_POINT_NO_REVIEW,
  PUBLISH_POINT_VERSION_HISTORY,
  PUBLISH_THIS_ROUTINE,
  WHAT_HAPPENS,
  exerciseCountLine,
  UNTITLED_ROUTINE,
  versionN,
} from "../copy/routines.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import { TYPE_LABELS } from "../copy/my-defaults.js";

export type RoutinePublishSheetProps = {
  open: boolean;
  name: string;
  bodyRegionLabel: string;
  conditionLabel: string | null;
  rows: RoutineExerciseRow[];
  publishBusy: boolean;
  onClose: () => void;
  onPublish: () => void;
  onNotYet: () => void;
};

export function RoutinePublishSheet({
  open,
  name,
  bodyRegionLabel,
  conditionLabel,
  rows,
  publishBusy,
  onClose,
  onPublish,
  onNotYet,
}: RoutinePublishSheetProps) {
  const meta =
    conditionLabel !== null && conditionLabel.length > 0
      ? `${conditionLabel} · ${bodyRegionLabel}`
      : bodyRegionLabel;

  return (
    <ConfirmSheet
      open={open}
      title={PUBLISH_THIS_ROUTINE}
      titleId="rt-publish-sheet-title"
      onClose={onClose}
      footer={
        <div className="rt-sheet-footer">
          <button
            type="button"
            className="ex-secondary-btn"
            disabled={publishBusy}
            onClick={onNotYet}
          >
            {NOT_YET}
          </button>
          <button
            type="button"
            className="ex-primary-btn"
            disabled={publishBusy}
            data-testid="rt-publish-confirm"
            onClick={onPublish}
          >
            {PUBLISH_NOW}
          </button>
        </div>
      }
    >
      <article className="rt-publish-card">
        <h3>{name.trim().length > 0 ? name : UNTITLED_ROUTINE}</h3>
        <p className="rt-card-meta">{meta}</p>
        <p className="rt-card-submeta">{exerciseCountLine(rows.length, versionN(1))}</p>
        <ul className="rt-exercise-list rt-exercise-list--compact">
          {rows.map((row) => (
            <li key={`${row.exercise_id}-${row.position}`} className="rt-exercise-row">
              <span>{row.exercise_name}</span>
              <span className="rt-type-chip">
                {TYPE_LABELS[row.prescription_type] ?? row.prescription_type}
              </span>
              <span>{formatExerciseParams(row.params)}</span>
            </li>
          ))}
        </ul>
      </article>
      <div className="rt-publish-points">
        <h4>{WHAT_HAPPENS}</h4>
        <ul>
          <li>{PUBLISH_POINT_LIVE_V1}</li>
          <li>{PUBLISH_POINT_VERSION_HISTORY}</li>
          <li>{PUBLISH_POINT_NO_REVIEW}</li>
        </ul>
      </div>
      <p className="ex-muted">{NOT_YET_KEEPS_DRAFT}</p>
    </ConfirmSheet>
  );
}
