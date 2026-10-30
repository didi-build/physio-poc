import {
  useCallback,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import "../styles/exercise-motion.css";
import {
  EXERCISE_MOTION_LOOP_DURATION_CSS,
  exerciseMotionEndAlt,
  exerciseMotionStartAlt,
} from "../exercise-motion/timing.js";
import { ARIA_PAUSE_EXERCISE_VIDEO, ARIA_PLAY_EXERCISE_VIDEO } from "../copy/a11y.js";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";

export type ExerciseMotionProps = {
  startSrc: string;
  endSrc: string;
  alt: string;
  className?: string;
};

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <rect x="2" y="1" width="3.5" height="12" rx="1" />
      <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M3 1.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 3 1.5z" />
    </svg>
  );
}

export function ExerciseMotion({
  startSrc,
  endSrc,
  alt,
  className = "",
}: ExerciseMotionProps) {
  const [playing, setPlaying] = useState(true);
  const staticRegionId = useId();
  const prefersReducedMotion = usePrefersReducedMotion();

  const togglePlaying = useCallback(() => {
    setPlaying((current) => !current);
  }, []);

  const onRootClick = useCallback(() => {
    togglePlaying();
  }, [togglePlaying]);

  const onRootKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        togglePlaying();
      }
    },
    [togglePlaying],
  );

  const onPauseClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      togglePlaying();
    },
    [togglePlaying],
  );

  const rootClassName = [
    "exercise-motion-root",
    playing ? "" : "exercise-motion-paused",
    prefersReducedMotion ? "exercise-motion-prefers-reduced" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const loopDurationStyle = {
    "--exercise-motion-loop-duration": EXERCISE_MOTION_LOOP_DURATION_CSS,
  } as CSSProperties;

  return (
    <div
      className={rootClassName}
      style={loopDurationStyle}
      onClick={onRootClick}
      onKeyDown={onRootKeyDown}
      role="group"
      aria-label={alt}
      tabIndex={0}
    >
      <div className="exercise-motion-loop" data-testid="exercise-motion-loop">
        <div className="exercise-motion-stage">
          <img
            src={startSrc}
            alt={exerciseMotionStartAlt(alt)}
            className="exercise-motion-start-img"
            data-testid="exercise-motion-start"
          />
          <img
            src={endSrc}
            alt={exerciseMotionEndAlt(alt)}
            className="exercise-motion-end-img"
            data-testid="exercise-motion-end"
          />
        </div>
        <div className="exercise-motion-progress-track" aria-hidden>
          <div className="exercise-motion-progress-bar" />
        </div>
        <button
          type="button"
          className="exercise-motion-pause-btn"
          aria-label={playing ? ARIA_PAUSE_EXERCISE_VIDEO : ARIA_PLAY_EXERCISE_VIDEO}
          onClick={onPauseClick}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <div
        className="exercise-motion-static"
        data-testid="exercise-motion-reduced-static"
        aria-labelledby={staticRegionId}
      >
        <figure className="exercise-motion-static-figure">
          <img
            src={startSrc}
            alt={exerciseMotionStartAlt(alt)}
            className="exercise-motion-static-img"
            data-testid="exercise-motion-static-start"
          />
          <figcaption className="exercise-motion-static-caption" id={staticRegionId}>
            Start
          </figcaption>
        </figure>
        <figure className="exercise-motion-static-figure">
          <img
            src={endSrc}
            alt={exerciseMotionEndAlt(alt)}
            className="exercise-motion-static-img"
            data-testid="exercise-motion-static-end"
          />
          <figcaption className="exercise-motion-static-caption">End</figcaption>
        </figure>
      </div>
    </div>
  );
}
