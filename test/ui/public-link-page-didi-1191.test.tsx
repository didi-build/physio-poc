/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
import { ARIA_PAUSE_EXERCISE_VIDEO } from "../../src/ui/copy/a11y.js";

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
