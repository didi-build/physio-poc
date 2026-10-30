/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExerciseMotion } from "../../src/ui/components/ExerciseMotion.js";

const LOOP_DURATION_CSS = "6s";

afterEach(() => {
  cleanup();
});

describe("exercise motion timing", () => {
  it("sets the loop duration custom property to 6s", () => {
    render(
      <ExerciseMotion startSrc="/start.svg" endSrc="/end.svg" alt="Heel slides" />,
    );
    const root = screen.getByRole("group", { name: "Heel slides" });
    expect(root).toHaveStyle({
      "--exercise-motion-loop-duration": LOOP_DURATION_CSS,
    });
  });
});
