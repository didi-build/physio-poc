import { useState } from "react";
import { ExerciseMotion } from "../components/ExerciseMotion.js";
import {
  exerciseMotionEndAlt,
  exerciseMotionStartAlt,
} from "../exercise-motion/timing.js";
import {
  exerciseVisualPlaceholders,
  type ExerciseVisualSources,
} from "./placeholders.js";

const LINK_TOGGLE_PLAY = "Play video";
const LINK_TOGGLE_SHOW = "Show images";
const LINK_START_CAPTION = "Start";
const LINK_END_CAPTION = "End";

export type PublicLinkExerciseVideoProps = Partial<ExerciseVisualSources>;

/**
 * Public link page row: stills by default, ExerciseMotion when the patient taps Play video.
 */
export function PublicLinkExerciseVideo(sources: PublicLinkExerciseVideoProps = {}) {
  const defaults = exerciseVisualPlaceholders(sources.alt);
  const startSrc = sources.startSrc ?? defaults.startSrc;
  const endSrc = sources.endSrc ?? defaults.endSrc;
  const alt = sources.alt ?? defaults.alt;
  const [playing, setPlaying] = useState(false);

  const staticGridClass = [
    "exercise-motion-link-static-grid",
    playing ? "exercise-motion-link-static-grid--screen-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div data-testid="public-link-exercise-video">
      <div className={staticGridClass}>
        <figure>
          <img
            src={startSrc}
            alt={exerciseMotionStartAlt(alt)}
            className="exercise-motion-static-img"
            data-testid="public-link-static-start"
          />
          <figcaption className="exercise-motion-static-caption">
            {LINK_START_CAPTION}
          </figcaption>
        </figure>
        <figure>
          <img
            src={endSrc}
            alt={exerciseMotionEndAlt(alt)}
            className="exercise-motion-static-img"
            data-testid="public-link-static-end"
          />
          <figcaption className="exercise-motion-static-caption">
            {LINK_END_CAPTION}
          </figcaption>
        </figure>
      </div>
      {playing ? (
        <ExerciseMotion
          startSrc={startSrc}
          endSrc={endSrc}
          alt={alt}
          className="mt-2"
        />
      ) : null}
      <button
        type="button"
        className="exercise-motion-link-toggle link-page-no-print"
        onClick={() => {
          setPlaying((current) => !current);
        }}
      >
        {playing ? LINK_TOGGLE_SHOW : LINK_TOGGLE_PLAY}
      </button>
    </div>
  );
}
