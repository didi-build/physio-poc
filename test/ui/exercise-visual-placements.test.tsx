/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  exerciseMotionEndAlt,
  exerciseMotionStartAlt,
} from "../../src/ui/exercise-motion/timing.js";
import {
  DraftReviewExerciseVideo,
  LibraryDetailExerciseVideo,
  PublicLinkExerciseVideo,
} from "../../src/ui/exercise-visual/index.js";
import { EXERCISE_VISUAL_PLACEHOLDER_ALT } from "../../src/ui/exercise-visual/placeholders.js";

const LIBRARY_VIDEO_LOOP_CAPTION = "Video, 6s loop";
const DRAFT_REVIEW_VIDEO_LOOP_CAPTION = "AI video, 6s loop";

afterEach(() => {
  cleanup();
});

describe("exercise visual placements", () => {
  it("renders the library detail caption Video, 6s loop", () => {
    render(<LibraryDetailExerciseVideo />);
    expect(screen.getByText(LIBRARY_VIDEO_LOOP_CAPTION)).toBeInTheDocument();
  });

  it("renders the draft review caption AI video, 6s loop", () => {
    render(<DraftReviewExerciseVideo />);
    expect(screen.getByText(DRAFT_REVIEW_VIDEO_LOOP_CAPTION)).toBeInTheDocument();
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
