/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExerciseMediaLoop } from "../../src/ui/components/ExerciseMediaLoop.js";
import {
  MEDIA_AI_IMAGE_TAG,
  MEDIA_AI_VIDEO_TAG,
} from "../../src/ui/copy/exercise-media.js";

describe("exercise media copy slots", () => {
  it("renders AI image tag verbatim and omits video tag until DIDI-1068", () => {
    expect(MEDIA_AI_VIDEO_TAG).toBeUndefined();
    render(<ExerciseMediaLoop startAlt="Start" endAlt="End" />);
    expect(screen.getAllByText(MEDIA_AI_IMAGE_TAG).length).toBeGreaterThan(0);
    expect(screen.queryByText("AI video")).not.toBeInTheDocument();
  });
});
