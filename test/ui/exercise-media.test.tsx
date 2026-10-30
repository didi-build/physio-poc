/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  LibraryDetailExerciseStill,
  LibraryDetailExerciseVideo,
} from "../../src/ui/exercise-visual/index.js";
import {
  MEDIA_AI_IMAGE_TAG,
  MEDIA_AI_VIDEO_TAG,
  MEDIA_LOOP_CAPTION_STRENGTH_SUFFIX,
} from "../../src/ui/copy/exercise-media.js";

describe("exercise media copy slots", () => {
  it("renders AI image tag verbatim and omits video tag until DIDI-1068", () => {
    expect(MEDIA_AI_VIDEO_TAG).toBeUndefined();
    render(
      <>
        <LibraryDetailExerciseStill label="Start position" />
        <LibraryDetailExerciseVideo alt="Bridge" />
      </>,
    );
    expect(screen.getAllByText(MEDIA_AI_IMAGE_TAG).length).toBeGreaterThan(0);
    expect(screen.queryByText("AI video")).not.toBeInTheDocument();
  });

  it("appends strength loop caption suffix when provided", () => {
    render(
      <LibraryDetailExerciseVideo
        alt="Squat"
        loopCaptionSuffix={MEDIA_LOOP_CAPTION_STRENGTH_SUFFIX}
      />,
    );
    expect(
      screen.getByText(`Video, 6s loop${MEDIA_LOOP_CAPTION_STRENGTH_SUFFIX}`),
    ).toBeInTheDocument();
  });
});
