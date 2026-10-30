/** Single source for loop length in CSS (via custom property) and spec copy. */
export const EXERCISE_MOTION_LOOP_DURATION_SECONDS = 6;

export const EXERCISE_MOTION_LOOP_DURATION_CSS = `${EXERCISE_MOTION_LOOP_DURATION_SECONDS}s`;

/** Library exercise details figcaption: Video, 6s loop */
export function exerciseMotionLibraryVideoLoopCaption(): string {
  return `Video, ${EXERCISE_MOTION_LOOP_DURATION_SECONDS}s loop`;
}

/** Draft review screen figcaption: AI video, 6s loop */
export function exerciseMotionDraftReviewVideoLoopCaption(): string {
  return `AI video, ${EXERCISE_MOTION_LOOP_DURATION_SECONDS}s loop`;
}

export function exerciseMotionStartAlt(name: string): string {
  return `${name}, start position`;
}

export function exerciseMotionEndAlt(name: string): string {
  return `${name}, end position`;
}
