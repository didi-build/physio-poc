/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import "../../src/ui/styles/public-link-page.css";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicLinkExerciseCarousel } from "../../src/ui/link-page/PublicLinkExerciseCarousel.js";
import { PUBLIC_LINK_CAROUSEL_START } from "../../src/copy/programs-share.js";

const MEDIA = {
  start_url: "https://cdn.example/start.png",
  end_url: "https://cdn.example/end.png",
};

afterEach(() => {
  cleanup();
});

describe("PublicLinkExerciseCarousel unit (DIDI-1191)", () => {
  it("does not focus Try again on initial null media (spec 3g)", () => {
    render(<PublicLinkExerciseCarousel title="Heel slide" media={null} />);
    const tryAgain = screen.getByRole("button", {
      name: "Try loading images for Heel slide again",
    });
    expect(document.activeElement).not.toBe(tryAgain);
  });

  it("focuses the carousel frame only after Try again following image error (spec 3g)", async () => {
    const user = userEvent.setup();
    render(<PublicLinkExerciseCarousel title="Heel slide" media={MEDIA} />);
    const start = await screen.findByTestId("exercise-motion-start");
    fireEvent.error(start);
    await waitFor(() => {
      expect(screen.getByTestId("public-link-media-failed")).toBeInTheDocument();
    });
    expect(document.activeElement).not.toHaveClass("link-page-carousel-frame");
    await user.click(
      screen.getByRole("button", { name: "Try loading images for Heel slide again" }),
    );
    await waitFor(() => {
      expect(document.activeElement).toHaveClass("link-page-carousel-frame");
    });
  });

  it("applies no indicator colour transition under reduced motion (spec 3f)", () => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      render(<PublicLinkExerciseCarousel title="Heel slide" media={MEDIA} />);
      expect(
        document.querySelector(".link-page-carousel--reduced-motion"),
      ).not.toBeNull();
      expect(
        document.querySelector(
          ".link-page-carousel--reduced-motion .link-page-carousel-indicator",
        ),
      ).not.toBeNull();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("places Start caption under indicators after navigating to slide 2 (spec 3e)", async () => {
    const user = userEvent.setup();
    render(<PublicLinkExerciseCarousel title="Heel slide" media={MEDIA} />);
    const track = document.querySelector(".link-page-carousel-track");
    expect(track).not.toBeNull();
    await user.click(screen.getByRole("button", { name: PUBLIC_LINK_CAROUSEL_START }));
    const caption = document.querySelector(".link-page-carousel-caption");
    expect(caption).not.toBeNull();
    expect(track!.contains(caption)).toBe(false);
    const indicators = document.querySelector(".link-page-carousel-indicators");
    expect(
      indicators!.compareDocumentPosition(caption!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
