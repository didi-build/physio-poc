/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  EXERCISE_MOTION_LOOP_DURATION_SECONDS,
  exerciseMotionAiVideoLoopCaption,
  exerciseMotionEndAlt,
  exerciseMotionStartAlt,
} from "../../src/ui/exercise-motion/timing.js";
import {
  DraftReviewExerciseVideo,
  LibraryDetailExerciseVideo,
  PublicLinkExerciseVideo,
} from "../../src/ui/exercise-visual/index.js";
import { EXERCISE_VISUAL_PLACEHOLDER_ALT } from "../../src/ui/exercise-visual/placeholders.js";

afterEach(() => {
  cleanup();
});

describe("exercise visual placements", () => {
  it("renders the AI video loop caption from the shared loop duration constant", () => {
    expect(exerciseMotionAiVideoLoopCaption()).toBe(
      `AI video, ${EXERCISE_MOTION_LOOP_DURATION_SECONDS}s loop`,
    );
    render(<LibraryDetailExerciseVideo />);
    expect(screen.getByText(exerciseMotionAiVideoLoopCaption())).toBeInTheDocument();
  });

  it("renders DraftReviewExerciseVideo with ExerciseMotion", () => {
    render(<DraftReviewExerciseVideo />);
    expect(screen.getByText(exerciseMotionAiVideoLoopCaption())).toBeInTheDocument();
  });

  it("renders PublicLinkExerciseVideo with Play video toggle and consistent image alts", async () => {
    const user = userEvent.setup();
    render(<PublicLinkExerciseVideo alt="Bridge" />);

    expect(screen.getByTestId("public-link-static-start")).toHaveAttribute(
      "alt",
      exerciseMotionStartAlt("Bridge"),
    );
    expect(screen.getByTestId("public-link-static-end")).toHaveAttribute(
      "alt",
      exerciseMotionEndAlt("Bridge"),
    );
    expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play video" }));
    expect(screen.getByTestId("exercise-motion-loop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show images" })).toBeInTheDocument();
  });

  it("uses Exercise demonstration for default placeholder alt", () => {
    render(<LibraryDetailExerciseVideo />);
    expect(
      screen.getByRole("group", { name: EXERCISE_VISUAL_PLACEHOLDER_ALT }),
    ).toBeInTheDocument();
  });
});
