import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  PUBLIC_LINK_CAROUSEL_END,
  PUBLIC_LINK_CAROUSEL_NEXT,
  PUBLIC_LINK_CAROUSEL_PREVIOUS,
  PUBLIC_LINK_CAROUSEL_START,
  PUBLIC_LINK_CAROUSEL_VIDEO,
  PUBLIC_LINK_IMAGES_DIDNT_LOAD,
  PUBLIC_LINK_TRY_AGAIN,
  publicLinkTryLoadingImagesAgainLabel,
} from "../../copy/programs-share.js";
import { ExerciseMotion } from "../components/ExerciseMotion.js";
import {
  exerciseMotionEndAlt,
  exerciseMotionStartAlt,
} from "../exercise-motion/timing.js";
import { useMinWidth1024 } from "../hooks/useMinWidth1024.js";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
import type { PublicShareLinkRowMedia } from "../../services/programs/program-publish-service.js";
import { ARIA_PAUSE_EXERCISE_VIDEO, ARIA_PLAY_EXERCISE_VIDEO } from "../copy/a11y.js";

function CarouselPlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M3 1.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 3 1.5z" />
    </svg>
  );
}

function LoopPauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <rect x="2" y="1" width="3.5" height="12" rx="1" />
      <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
    </svg>
  );
}

function LoopPlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M3 1.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 3 1.5z" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SLIDE_NAMES = [
  PUBLIC_LINK_CAROUSEL_VIDEO,
  PUBLIC_LINK_CAROUSEL_START,
  PUBLIC_LINK_CAROUSEL_END,
] as const;

export type PublicLinkExerciseCarouselProps = {
  title: string;
  media: PublicShareLinkRowMedia | null;
};

export function PublicLinkExerciseCarousel({
  title,
  media,
}: PublicLinkExerciseCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const tryAgainRef = useRef<HTMLButtonElement>(null);
  const awaitingRetryOutcomeRef = useRef(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const missingMedia = media === null;
  const [loadFailed, setLoadFailed] = useState(missingMedia);
  const [retryKey, setRetryKey] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const desktop = useMinWidth1024();
  const captionId = useId();

  const startSrc = media?.start_url ?? null;
  const endSrc = media?.end_url ?? null;
  const loopPlaying = activeSlide === 0 && !userPaused && !prefersReducedMotion;

  useEffect(() => {
    setLoadFailed(missingMedia);
  }, [missingMedia]);

  const scrollToSlide = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const width = track.clientWidth;
      const behavior = prefersReducedMotion ? "auto" : "smooth";
      const left = width * index;
      if (typeof track.scrollTo === "function") {
        track.scrollTo({ left, behavior });
      } else {
        track.scrollLeft = left;
      }
      setActiveSlide(index);
    },
    [prefersReducedMotion],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track || loadFailed) {
      return;
    }
    const onScroll = () => {
      const width = track.clientWidth;
      if (width <= 0) {
        return;
      }
      const index = Math.round(track.scrollLeft / width);
      setActiveSlide(index);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
    };
  }, [loadFailed, retryKey]);

  const toggleUserPaused = useCallback(() => {
    setUserPaused((paused) => !paused);
  }, []);

  const onFrameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.key === "ArrowLeft" && activeSlide > 0) {
        event.preventDefault();
        scrollToSlide(activeSlide - 1);
      }
      if (event.key === "ArrowRight" && activeSlide < 2) {
        event.preventDefault();
        scrollToSlide(activeSlide + 1);
      }
      if (
        activeSlide === 0 &&
        !prefersReducedMotion &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        toggleUserPaused();
      }
    },
    [activeSlide, prefersReducedMotion, scrollToSlide, toggleUserPaused],
  );

  const markLoadFailed = useCallback(() => {
    setLoadFailed(true);
    if (awaitingRetryOutcomeRef.current) {
      awaitingRetryOutcomeRef.current = false;
      queueMicrotask(() => {
        tryAgainRef.current?.focus();
      });
    }
  }, []);

  const markRetryLoadSucceeded = useCallback(() => {
    if (!awaitingRetryOutcomeRef.current) {
      return;
    }
    awaitingRetryOutcomeRef.current = false;
    queueMicrotask(() => {
      frameRef.current?.focus();
    });
  }, []);

  const onRetry = useCallback(() => {
    if (missingMedia || !startSrc || !endSrc) {
      return;
    }
    awaitingRetryOutcomeRef.current = true;
    setLoadFailed(false);
    setRetryKey((key) => key + 1);
  }, [endSrc, missingMedia, startSrc]);

  if (loadFailed) {
    return (
      <div
        className="link-page-media-failed link-page-no-print"
        data-testid="public-link-media-failed"
      >
        <p>{PUBLIC_LINK_IMAGES_DIDNT_LOAD}</p>
        <button
          ref={tryAgainRef}
          type="button"
          className="link-page-media-retry"
          aria-label={publicLinkTryLoadingImagesAgainLabel(title)}
          onClick={onRetry}
        >
          {PUBLIC_LINK_TRY_AGAIN}
        </button>
      </div>
    );
  }

  if (!startSrc || !endSrc) {
    return null;
  }

  const showLoopControl = !prefersReducedMotion && activeSlide === 0;
  const slideCaption =
    activeSlide === 1
      ? PUBLIC_LINK_CAROUSEL_START
      : activeSlide === 2
        ? PUBLIC_LINK_CAROUSEL_END
        : null;

  return (
    <div
      className={`link-page-carousel link-page-no-print${
        prefersReducedMotion ? " link-page-carousel--reduced-motion" : ""
      }`}
      data-testid="public-link-exercise-carousel"
    >
      <div className="link-page-carousel-stage">
        <div
          ref={frameRef}
          className="link-page-carousel-frame"
          role="group"
          aria-label={title}
          tabIndex={0}
          onKeyDown={onFrameKeyDown}
        >
          <div ref={trackRef} className="link-page-carousel-track">
            <div
              className="link-page-carousel-slide"
              role="group"
              aria-label={SLIDE_NAMES[0]}
              aria-hidden={activeSlide !== 0}
              inert={activeSlide !== 0 ? true : undefined}
            >
              {prefersReducedMotion ? (
                <img
                  key={`start-${retryKey}`}
                  src={startSrc}
                  alt={exerciseMotionStartAlt(title)}
                  className="link-page-carousel-still"
                  onError={markLoadFailed}
                  onLoad={markRetryLoadSucceeded}
                />
              ) : activeSlide === 0 ? (
                <ExerciseMotion
                  key={`motion-${retryKey}`}
                  startSrc={startSrc}
                  endSrc={endSrc}
                  alt={title}
                  className="link-page-carousel-motion"
                  embedded
                  playing={loopPlaying}
                  onImageError={markLoadFailed}
                  onStartImageLoad={markRetryLoadSucceeded}
                  onPlayingChange={(playing) => {
                    setUserPaused(!playing);
                  }}
                />
              ) : (
                <img
                  src={startSrc}
                  alt={exerciseMotionStartAlt(title)}
                  className="link-page-carousel-still"
                  onError={markLoadFailed}
                />
              )}
            </div>
            <div
              className="link-page-carousel-slide"
              role="group"
              aria-label={SLIDE_NAMES[1]}
              aria-hidden={activeSlide !== 1}
              inert={activeSlide !== 1 ? true : undefined}
            >
              <img
                key={`start-still-${retryKey}`}
                src={startSrc}
                alt={exerciseMotionStartAlt(title)}
                className="link-page-carousel-still"
                onError={markLoadFailed}
              />
            </div>
            <div
              className="link-page-carousel-slide"
              role="group"
              aria-label={SLIDE_NAMES[2]}
              aria-hidden={activeSlide !== 2}
              inert={activeSlide !== 2 ? true : undefined}
            >
              <img
                key={`end-still-${retryKey}`}
                src={endSrc}
                alt={exerciseMotionEndAlt(title)}
                className="link-page-carousel-still"
                onError={markLoadFailed}
              />
            </div>
          </div>
        </div>
        {showLoopControl ? (
          <button
            type="button"
            className="link-page-carousel-loop-btn exercise-motion-pause-btn"
            aria-label={
              loopPlaying ? ARIA_PAUSE_EXERCISE_VIDEO : ARIA_PLAY_EXERCISE_VIDEO
            }
            onClick={toggleUserPaused}
          >
            {loopPlaying ? <LoopPauseIcon /> : <LoopPlayIcon />}
          </button>
        ) : null}
        {desktop ? (
          <>
            <button
              type="button"
              className="link-page-carousel-chevron link-page-carousel-chevron--prev"
              aria-label={PUBLIC_LINK_CAROUSEL_PREVIOUS}
              disabled={activeSlide === 0}
              hidden={activeSlide === 0}
              onClick={() => {
                scrollToSlide(activeSlide - 1);
              }}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="link-page-carousel-chevron link-page-carousel-chevron--next"
              aria-label={PUBLIC_LINK_CAROUSEL_NEXT}
              disabled={activeSlide === 2}
              hidden={activeSlide === 2}
              onClick={() => {
                scrollToSlide(activeSlide + 1);
              }}
            >
              <ChevronRight />
            </button>
          </>
        ) : null}
      </div>
      <div className="link-page-carousel-indicators">
        {SLIDE_NAMES.map((name, index) => (
          <button
            key={name}
            type="button"
            className={[
              "link-page-carousel-indicator",
              index === 0
                ? "link-page-carousel-indicator--video"
                : "link-page-carousel-indicator--dot",
              activeSlide === index ? "link-page-carousel-indicator--current" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={name}
            aria-current={activeSlide === index ? true : undefined}
            onClick={() => {
              scrollToSlide(index);
            }}
          >
            {index === 0 ? (
              <CarouselPlayIcon />
            ) : (
              <span className="link-page-carousel-dot" />
            )}
          </button>
        ))}
      </div>
      {slideCaption ? (
        <p className="link-page-carousel-caption" id={captionId}>
          {slideCaption}
        </p>
      ) : null}
    </div>
  );
}
