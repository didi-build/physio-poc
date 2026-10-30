import placeholderEnd from "../assets/exercise-placeholder-end.svg";
import placeholderStart from "../assets/exercise-placeholder-start.svg";

/** Placeholder stills until DIDI-1013 provides generated exercise visuals. */
export const EXERCISE_VISUAL_PLACEHOLDER_START_SRC = placeholderStart;
export const EXERCISE_VISUAL_PLACEHOLDER_END_SRC = placeholderEnd;

export const EXERCISE_VISUAL_PLACEHOLDER_ALT = "Exercise demonstration";

export type ExerciseVisualSources = {
  startSrc: string;
  endSrc: string;
  alt: string;
};

export function exerciseVisualPlaceholders(
  alt: string = EXERCISE_VISUAL_PLACEHOLDER_ALT,
): ExerciseVisualSources {
  return {
    startSrc: EXERCISE_VISUAL_PLACEHOLDER_START_SRC,
    endSrc: EXERCISE_VISUAL_PLACEHOLDER_END_SRC,
    alt,
  };
}
