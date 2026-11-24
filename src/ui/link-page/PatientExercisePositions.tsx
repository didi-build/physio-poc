import { STARTING_POSITION } from "../copy/exercise-requests.js";
import { ENDING_POSITION_LABEL } from "../copy/ending-position.js";

export type PatientExercisePositionsProps = {
  startingPosition: string;
  endingPosition: string;
  className?: string;
};

export function PatientExercisePositions({
  startingPosition,
  endingPosition,
  className,
}: PatientExercisePositionsProps) {
  const start = startingPosition.trim();
  const end = endingPosition.trim();
  if (start.length === 0 && end.length === 0) {
    return null;
  }
  return (
    <dl className={`link-page-positions${className ? ` ${className}` : ""}`}>
      {start.length > 0 ? (
        <div className="link-page-positions-pair">
          <dt>
            <span
              className="link-page-positions-marker link-page-positions-marker--start"
              aria-hidden
            />
            {STARTING_POSITION}
          </dt>
          <dd>{start}</dd>
        </div>
      ) : null}
      {end.length > 0 ? (
        <div className="link-page-positions-pair">
          <dt>
            <span
              className="link-page-positions-marker link-page-positions-marker--end"
              aria-hidden
            />
            {ENDING_POSITION_LABEL}
          </dt>
          <dd>{end}</dd>
        </div>
      ) : null}
    </dl>
  );
}
