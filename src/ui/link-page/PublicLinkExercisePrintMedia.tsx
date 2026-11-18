import {
  PUBLIC_LINK_CAROUSEL_END,
  PUBLIC_LINK_CAROUSEL_START,
} from "../../copy/programs-share.js";
import {
  exerciseMotionEndAlt,
  exerciseMotionStartAlt,
} from "../exercise-motion/timing.js";

export type PublicLinkExercisePrintMediaProps = {
  title: string;
  startSrc: string;
  endSrc: string;
};

export function PublicLinkExercisePrintMedia({
  title,
  startSrc,
  endSrc,
}: PublicLinkExercisePrintMediaProps) {
  return (
    <div className="link-page-only-print" data-testid="public-link-exercise-print">
      <figure className="link-page-print-still link-page-print-still--start">
        <figcaption className="link-page-print-caption">
          {PUBLIC_LINK_CAROUSEL_START}
        </figcaption>
        <img
          src={startSrc}
          alt={exerciseMotionStartAlt(title)}
          className="link-page-print-still-img"
        />
      </figure>
      <figure className="link-page-print-still link-page-print-still--end">
        <figcaption className="link-page-print-caption">
          {PUBLIC_LINK_CAROUSEL_END}
        </figcaption>
        <img
          src={endSrc}
          alt={exerciseMotionEndAlt(title)}
          className="link-page-print-still-img"
        />
      </figure>
    </div>
  );
}
