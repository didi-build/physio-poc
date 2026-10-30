import { ExerciseMotion } from "../components/ExerciseMotion.js";
import { MEDIA_AI_IMAGE_TAG, MEDIA_AI_VIDEO_TAG } from "../copy/exercise-media.js";
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
  /** Appended to the library loop caption (e.g. strength-only suffix from copy). */
  loopCaptionSuffix?: string;
};

export type LibraryDetailExerciseStillProps = {
  label: string;
  className?: string;
};

/** Library exercise details: still pose placeholder with AI image tag (design mock). */
export function LibraryDetailExerciseStill({
  label,
  className = "",
}: LibraryDetailExerciseStillProps) {
  return (
    <div className={`ex-media-placeholder ${className}`}>
      <span className="ex-media-tag">{MEDIA_AI_IMAGE_TAG}</span>
      <span className="ex-media-placeholder-label">{label}</span>
    </div>
  );
}

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
  loopCaptionSuffix = "",
  ...sources
}: ExerciseVideoFigureProps) {
  const { startSrc, endSrc, alt } = resolveVisualSources(sources);

  return (
    <figure className="exercise-motion-video-figure">
      <div className="exercise-motion-video-wrap">
        <ExerciseMotion
          startSrc={startSrc}
          endSrc={endSrc}
          alt={alt}
          className={className}
        />
        {MEDIA_AI_VIDEO_TAG ? (
          <span className="ex-media-tag ex-media-video-tag">{MEDIA_AI_VIDEO_TAG}</span>
        ) : null}
      </div>
      <figcaption className="exercise-motion-video-caption">
        {exerciseMotionLibraryVideoLoopCaption()}
        {loopCaptionSuffix}
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
