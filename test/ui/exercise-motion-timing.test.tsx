/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExerciseMotion } from "../../src/ui/components/ExerciseMotion.js";
import { EXERCISE_MOTION_LOOP_DURATION_CSS } from "../../src/ui/exercise-motion/timing.js";

afterEach(() => {
  cleanup();
});

describe("exercise motion timing", () => {
  it("sets the loop duration custom property from the shared constant", () => {
    render(
      <ExerciseMotion startSrc="/start.svg" endSrc="/end.svg" alt="Heel slides" />,
    );
    const root = screen.getByRole("group", { name: "Heel slides" });
    expect(root).toHaveStyle({
      "--exercise-motion-loop-duration": EXERCISE_MOTION_LOOP_DURATION_CSS,
    });
  });
});
