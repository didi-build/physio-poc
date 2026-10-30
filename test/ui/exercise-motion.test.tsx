/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseMotion } from "../../src/ui/components/ExerciseMotion.js";
import {
  ARIA_PAUSE_EXERCISE_VIDEO,
  ARIA_PLAY_EXERCISE_VIDEO,
} from "../../src/ui/copy/a11y.js";

afterEach(() => {
  cleanup();
});

describe("ExerciseMotion", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  it("renders both loop images with alt text derived from alt", () => {
    render(
      <ExerciseMotion startSrc="/start.svg" endSrc="/end.svg" alt="Heel slides" />,
    );

    expect(screen.getByTestId("exercise-motion-start")).toHaveAttribute(
      "alt",
      "Heel slides, start position",
    );
    expect(screen.getByTestId("exercise-motion-end")).toHaveAttribute(
      "alt",
      "Heel slides, end position",
    );
  });

  it("shows side-by-side stills in the reduced-motion branch", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    render(
      <ExerciseMotion startSrc="/start.svg" endSrc="/end.svg" alt="Heel slides" />,
    );

    expect(
      document.querySelector(".exercise-motion-prefers-reduced"),
    ).toBeInTheDocument();
    const reduced = screen.getByTestId("exercise-motion-reduced-static");
    expect(reduced).toBeInTheDocument();
    expect(within(reduced).getByTestId("exercise-motion-static-start")).toHaveAttribute(
      "src",
      "/start.svg",
    );
    expect(within(reduced).getByTestId("exercise-motion-static-end")).toHaveAttribute(
      "src",
      "/end.svg",
    );
  });

  it("toggles pause state from the visible control, image click, and keyboard", async () => {
    const user = userEvent.setup();
    render(
      <ExerciseMotion startSrc="/start.svg" endSrc="/end.svg" alt="Heel slides" />,
    );

    const pauseButton = screen.getByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO });
    expect(pauseButton).toBeInTheDocument();

    await user.click(pauseButton);
    expect(
      screen.getByRole("button", { name: ARIA_PLAY_EXERCISE_VIDEO }),
    ).toBeInTheDocument();
    expect(document.querySelector(".exercise-motion-paused")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: ARIA_PLAY_EXERCISE_VIDEO }));
    expect(
      screen.getByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("exercise-motion-start"));
    expect(
      screen.getByRole("button", { name: ARIA_PLAY_EXERCISE_VIDEO }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("exercise-motion-end"));
    expect(
      screen.getByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO }),
    ).toBeInTheDocument();

    const root = screen.getByRole("group", { name: "Heel slides" });
    root.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: ARIA_PLAY_EXERCISE_VIDEO }),
    ).toBeInTheDocument();

    fireEvent.keyDown(root, { key: " " });
    expect(
      screen.getByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO }),
    ).toBeInTheDocument();
  });
});
