/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicLinkPage } from "../../src/ui/pages/PublicLinkPage.js";
import {
  PUBLIC_LINK_CAROUSEL_END,
  PUBLIC_LINK_CAROUSEL_START,
  PUBLIC_LINK_CAROUSEL_VIDEO,
  PUBLIC_LINK_IMAGES_DIDNT_LOAD,
  PUBLIC_LINK_TRY_AGAIN,
} from "../../src/copy/programs-share.js";
import {
  EXERCISE_VISUAL_PLACEHOLDER_END_SRC,
  EXERCISE_VISUAL_PLACEHOLDER_START_SRC,
} from "../../src/ui/exercise-visual/placeholders.js";
import {
  ARIA_PAUSE_EXERCISE_VIDEO,
  ARIA_PLAY_EXERCISE_VIDEO,
} from "../../src/ui/copy/a11y.js";

const MEDIA = {
  start_url: "https://cdn.example/start.png",
  end_url: "https://cdn.example/end.png",
};

function mockOpenLink(
  rows: Array<{
    position: number;
    title: string;
    prescription_type: "stretching";
    params: Record<string, number>;
    note: string | null;
    media: typeof MEDIA | null;
  }>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        availability: "open",
        program_name: "Week one",
        published_at: "2026-04-01T00:00:00.000Z",
        expiry_line: "This link stays open until your physiotherapist closes it.",
        rows,
      }),
    }),
  );
  render(
    <MemoryRouter initialEntries={["/l/demo-token"]}>
      <Routes>
        <Route path="/l/:code" element={<PublicLinkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Public link page media carousel (DIDI-1191)", () => {
  it("renders the carousel with Video, Start, and End indicators", async () => {
    mockOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30, sets: 3 },
        note: null,
        media: MEDIA,
      },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("public-link-exercise-carousel")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: PUBLIC_LINK_CAROUSEL_VIDEO }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: PUBLIC_LINK_CAROUSEL_START }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: PUBLIC_LINK_CAROUSEL_END }),
    ).toBeInTheDocument();
    expect(document.querySelector(".link-page-carousel-frame")).toHaveAttribute(
      "aria-label",
      "Heel slide",
    );
    expect(
      screen.getByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO }),
    ).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("3 sets");
    const images = document.querySelectorAll("img");
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      expect(src).not.toBe(EXERCISE_VISUAL_PLACEHOLDER_START_SRC);
      expect(src).not.toBe(EXERCISE_VISUAL_PLACEHOLDER_END_SRC);
    }
  });

  it("shows visible 8px dot indicators on Start and End slides (spec 3a)", async () => {
    mockOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: MEDIA,
      },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("public-link-exercise-carousel")).toBeInTheDocument();
    });
    const dots = document.querySelectorAll(".link-page-carousel-dot");
    expect(dots).toHaveLength(2);
    for (const dot of dots) {
      expect(dot).toHaveClass("link-page-carousel-dot");
    }
    const current = document.querySelector(".link-page-carousel-indicator--current");
    expect(current).toHaveClass("link-page-carousel-indicator--video");
    expect(
      document.querySelectorAll(
        ".link-page-carousel-indicator--dot .link-page-carousel-dot",
      ),
    ).toHaveLength(2);
  });

  it("toggles pause with Enter and Space on the frame while on slide 1 (spec 3b)", async () => {
    const user = userEvent.setup();
    mockOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: MEDIA,
      },
    ]);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO }),
      ).toBeInTheDocument();
    });
    const frame = document.querySelector(".link-page-carousel-frame");
    expect(frame).not.toBeNull();
    (frame as HTMLElement).focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: ARIA_PLAY_EXERCISE_VIDEO }),
    ).toBeInTheDocument();
    await user.keyboard(" ");
    expect(
      screen.getByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO }),
    ).toBeInTheDocument();
  });

  it("keeps user pause across leaving slide 1 and returning (spec 3c)", async () => {
    const user = userEvent.setup();
    mockOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: MEDIA,
      },
    ]);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO }));
    expect(
      screen.getByRole("button", { name: ARIA_PLAY_EXERCISE_VIDEO }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: PUBLIC_LINK_CAROUSEL_START }));
    await user.click(screen.getByRole("button", { name: PUBLIC_LINK_CAROUSEL_VIDEO }));
    expect(
      screen.getByRole("button", { name: ARIA_PLAY_EXERCISE_VIDEO }),
    ).toBeInTheDocument();
  });

  it("follows tab order frame, loop control, then indicators (spec 3d)", async () => {
    const user = userEvent.setup();
    mockOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: MEDIA,
      },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("public-link-exercise-carousel")).toBeInTheDocument();
    });
    const frame = document.querySelector(".link-page-carousel-frame") as HTMLElement;
    frame.focus();
    expect(document.activeElement).toBe(frame);
    await user.tab();
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      ARIA_PAUSE_EXERCISE_VIDEO,
    );
    await user.tab();
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      PUBLIC_LINK_CAROUSEL_VIDEO,
    );
  });

  it("does not focus Try again on initial load failed (spec 3g)", async () => {
    mockOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: null,
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText(PUBLIC_LINK_IMAGES_DIDNT_LOAD)).toBeInTheDocument();
    });
    const tryAgain = screen.getByRole("button", {
      name: "Try loading images for Heel slide again",
    });
    expect(document.activeElement).not.toBe(tryAgain);
  });

  it("with media null keeps load failed without empty src or loop (spec 3h)", async () => {
    mockOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: null,
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText(PUBLIC_LINK_IMAGES_DIDNT_LOAD)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("public-link-exercise-carousel")).toBeNull();
    expect(screen.queryByTestId("exercise-motion-loop")).toBeNull();
    for (const img of document.querySelectorAll("img")) {
      expect(img.getAttribute("src")).not.toBe("");
    }
    await userEvent.click(
      screen.getByRole("button", { name: "Try loading images for Heel slide again" }),
    );
    expect(screen.getByTestId("public-link-media-failed")).toBeInTheDocument();
    expect(screen.queryByTestId("exercise-motion-loop")).toBeNull();
  });

  it("shows load failed with Try again when media is null", async () => {
    mockOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: null,
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText(PUBLIC_LINK_IMAGES_DIDNT_LOAD)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Try loading images for Heel slide again" }),
    ).toHaveTextContent(PUBLIC_LINK_TRY_AGAIN);
    expect(screen.queryByTestId("public-link-exercise-carousel")).toBeNull();
    expect(document.querySelector(".link-page-media-failed")).toHaveClass(
      "link-page-no-print",
    );
  });

  it("does not show Pause video on slide 1 when reduced motion is preferred", async () => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    try {
      mockOpenLink([
        {
          position: 0,
          title: "Heel slide",
          prescription_type: "stretching",
          params: { hold_s: 30 },
          note: null,
          media: MEDIA,
        },
      ]);
      await waitFor(() => {
        expect(screen.getByTestId("public-link-exercise-carousel")).toBeInTheDocument();
      });
      expect(
        screen.queryByRole("button", { name: ARIA_PAUSE_EXERCISE_VIDEO }),
      ).toBeNull();
      expect(screen.queryByTestId("exercise-motion-loop")).toBeNull();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("marks the expiry footer as screen-only chrome", async () => {
    mockOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: MEDIA,
      },
    ]);
    await waitFor(() => {
      expect(
        screen.getByText("This link stays open until your physiotherapist closes it."),
      ).toBeInTheDocument();
    });
    expect(document.querySelector(".link-page-footer")).toHaveClass(
      "link-page-no-print",
    );
  });
});
