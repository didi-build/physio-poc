/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  DraftReviewExerciseVideo,
  LibraryDetailExerciseVideo,
  PublicLinkExerciseVideo,
} from "../../src/ui/exercise-visual/index.js";

afterEach(() => {
  cleanup();
});

describe("exercise visual placements", () => {
  it("renders LibraryDetailExerciseVideo with the merged spec caption", () => {
    render(<LibraryDetailExerciseVideo />);
    expect(screen.getByText("AI video, 6s loop")).toBeInTheDocument();
    expect(screen.getByTestId("exercise-motion-start")).toBeInTheDocument();
  });

  it("renders DraftReviewExerciseVideo with ExerciseMotion", () => {
    render(<DraftReviewExerciseVideo />);
    expect(screen.getByText("AI video, 6s loop")).toBeInTheDocument();
  });

  it("renders PublicLinkExerciseVideo with Play video toggle", async () => {
    const user = userEvent.setup();
    render(<PublicLinkExerciseVideo alt="Bridge" />);

    expect(screen.getByTestId("public-link-static-start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play video" }));
    expect(screen.getByTestId("exercise-motion-loop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show images" })).toBeInTheDocument();
  });
});
