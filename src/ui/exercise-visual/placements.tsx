import { ExerciseMotion } from "../components/ExerciseMotion.js";
import {
  exerciseVisualPlaceholders,
  type ExerciseVisualSources,
} from "./placeholders.js";

const AI_VIDEO_LOOP_CAPTION = "AI video, 6s loop";

export type ExerciseVideoFigureProps = Partial<ExerciseVisualSources> & {
  className?: string;
};

/** Library exercise details: merged spec video placeholder (figure under start/end stills). */
export function LibraryDetailExerciseVideo({
  className,
  ...sources
}: ExerciseVideoFigureProps) {
  const { startSrc, endSrc, alt } = exerciseVisualPlaceholders(sources.alt);
  const start = sources.startSrc ?? startSrc;
  const end = sources.endSrc ?? endSrc;
  const label = sources.alt ?? alt;

  return (
    <figure className="exercise-motion-video-figure">
      <ExerciseMotion startSrc={start} endSrc={end} alt={label} className={className} />
      <figcaption className="exercise-motion-video-caption">
        {AI_VIDEO_LOOP_CAPTION}
      </figcaption>
    </figure>
  );
}

/** Draft review screen: same video placement as library details. */
export function DraftReviewExerciseVideo(props: ExerciseVideoFigureProps) {
  return <LibraryDetailExerciseVideo {...props} />;
}
