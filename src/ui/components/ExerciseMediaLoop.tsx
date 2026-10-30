import { useState } from "react";
import { MEDIA_AI_IMAGE_TAG, MEDIA_AI_VIDEO_TAG } from "../copy/exercise-media.js";
import "../components/exercise-media-loop.css";

type ExerciseMediaLoopProps = {
  startAlt: string;
  endAlt: string;
  className?: string;
};

export function ExerciseMediaPlaceholder({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div className={`ex-media-placeholder ${className}`}>
      <span className="ex-media-tag">{MEDIA_AI_IMAGE_TAG}</span>
      <span className="ex-media-placeholder-label">{label}</span>
    </div>
  );
}

export function ExerciseMediaLoop({
  startAlt,
  endAlt,
  className = "",
}: ExerciseMediaLoopProps) {
  const [playing, setPlaying] = useState(true);
  return (
    <div className={`ex-media-loop ${playing ? "" : "ex-media-paused"} ${className}`}>
      <div className="ex-media-loop-stage">
        <div className="ex-media-placeholder ex-media-loop-start" aria-hidden>
          <span className="ex-media-tag">{MEDIA_AI_IMAGE_TAG}</span>
        </div>
        <div className="ex-media-placeholder ex-media-loop-end" aria-hidden>
          <span className="ex-media-tag">{MEDIA_AI_IMAGE_TAG}</span>
        </div>
      </div>
      {MEDIA_AI_VIDEO_TAG ? (
        <span className="ex-media-tag ex-media-video-tag">{MEDIA_AI_VIDEO_TAG}</span>
      ) : null}
      <div className="ex-media-progress">
        <div className="ex-media-progress-bar" />
      </div>
      <button
        type="button"
        className="ex-media-play-toggle"
        aria-label={playing ? "Pause video" : "Play video"}
        onClick={() => {
          setPlaying((value) => !value);
        }}
      >
        {playing ? "||" : "▶"}
      </button>
      <span className="sr-only">
        {startAlt}; {endAlt}
      </span>
    </div>
  );
}
