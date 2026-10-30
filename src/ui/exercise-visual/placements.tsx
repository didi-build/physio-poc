import { ExerciseMotion } from "../components/ExerciseMotion.js";
import {
  exerciseMotionDraftReviewVideoLoopCaption,
  exerciseMotionLibraryVideoLoopCaption,
} from "../exercise-motion/timing.js";
import {
  exerciseVisualPlaceholders,
  type ExerciseVisualSources,
} from "./placeholders.js";

export type ExerciseVideoFigureProps = Partial<ExerciseVisualSources> & {
  className?: string;
};

function resolveVisualSources(sources: Partial<ExerciseVisualSources>) {
  const defaults = exerciseVisualPlaceholders(sources.alt);
  return {
    startSrc: sources.startSrc ?? defaults.startSrc,
    endSrc: sources.endSrc ?? defaults.endSrc,
    alt: sources.alt ?? defaults.alt,
  };
}

/** Library exercise details: merged spec video placeholder (figure under start/end stills). */
export function LibraryDetailExerciseVideo({
  className,
  ...sources
}: ExerciseVideoFigureProps) {
  const { startSrc, endSrc, alt } = resolveVisualSources(sources);

  return (
    <figure className="exercise-motion-video-figure">
      <ExerciseMotion
        startSrc={startSrc}
        endSrc={endSrc}
        alt={alt}
        className={className}
      />
      <figcaption className="exercise-motion-video-caption">
        {exerciseMotionLibraryVideoLoopCaption()}
      </figcaption>
    </figure>
  );
}

/** Draft review screen: video figure with draft review caption. */
export function DraftReviewExerciseVideo({
  className,
  ...sources
}: ExerciseVideoFigureProps) {
  const { startSrc, endSrc, alt } = resolveVisualSources(sources);

  return (
    <figure className="exercise-motion-video-figure">
      <ExerciseMotion
        startSrc={startSrc}
        endSrc={endSrc}
        alt={alt}
        className={className}
      />
      <figcaption className="exercise-motion-video-caption">
        {exerciseMotionDraftReviewVideoLoopCaption()}
      </figcaption>
    </figure>
  );
}
