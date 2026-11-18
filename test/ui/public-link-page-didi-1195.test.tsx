/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicLinkPage } from "../../src/ui/pages/PublicLinkPage.js";
import {
  EXERCISE_VISUAL_PLACEHOLDER_END_SRC,
  EXERCISE_VISUAL_PLACEHOLDER_START_SRC,
} from "../../src/ui/exercise-visual/placeholders.js";

const PRINT_STYLESHEET = join(process.cwd(), "src/ui/styles/public-link-page.css");

const EXPIRY_STAYS_OPEN =
  "This link stays open until your physiotherapist closes it." as const;
const EXPIRY_UNTIL_DATE = "This link works until Apr 1, 2026." as const;
const PRINT_START_CAPTION = "Start" as const;
const PRINT_END_CAPTION = "End" as const;
const IMAGES_DIDNT_LOAD = "Images didn't load." as const;
const HEEL_START_ALT = "Heel slide, start position" as const;
const HEEL_END_ALT = "Heel slide, end position" as const;

const START_URL = "https://cdn.example/heel-start.png" as const;
const END_URL = "https://cdn.example/heel-end.png" as const;

function mockOpenLink(
  expiryLine: string,
  rows: Array<{
    position: number;
    title: string;
    prescription_type: "stretching";
    params: Record<string, number>;
    note: string | null;
    media: { start_url: string; end_url: string } | null;
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
        expiry_line: expiryLine,
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

function assertNoScreenOnlyAncestor(element: Element) {
  let current: Element | null = element;
  while (current) {
    expect(current).not.toHaveClass("link-page-no-print");
    current = current.parentElement;
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Public link page print layout (DIDI-1195)", () => {
  it("renders real start and end image URLs with pinned copy in the print-only block", async () => {
    mockOpenLink(EXPIRY_STAYS_OPEN, [
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: { start_url: START_URL, end_url: END_URL },
      },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("public-link-exercise-print")).toBeInTheDocument();
    });
    const printRoot = screen.getByTestId("public-link-exercise-print");
    expect(printRoot).toHaveClass("link-page-only-print");
    assertNoScreenOnlyAncestor(printRoot);

    const startFigure = printRoot.querySelector(".link-page-print-still--start");
    const endFigure = printRoot.querySelector(".link-page-print-still--end");
    expect(startFigure).not.toBeNull();
    expect(endFigure).not.toBeNull();

    const startImg = startFigure!.querySelector("img");
    const endImg = endFigure!.querySelector("img");
    expect(startImg?.getAttribute("src")).toBe(START_URL);
    expect(endImg?.getAttribute("src")).toBe(END_URL);
    expect(startImg?.getAttribute("alt")).toBe(HEEL_START_ALT);
    expect(endImg?.getAttribute("alt")).toBe(HEEL_END_ALT);
    expect(startFigure!.querySelector("figcaption")?.textContent).toBe(
      PRINT_START_CAPTION,
    );
    expect(endFigure!.querySelector("figcaption")?.textContent).toBe(PRINT_END_CAPTION);

    const startCaption = startFigure!.querySelector("figcaption");
    const startImageForOrder = startFigure!.querySelector("img");
    expect(startImageForOrder).not.toBeNull();
    expect(startCaption).not.toBeNull();
    expect(
      startImageForOrder!.compareDocumentPosition(startCaption!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    for (const img of [startImg, endImg]) {
      const src = img?.getAttribute("src") ?? "";
      expect(src).not.toBe(EXERCISE_VISUAL_PLACEHOLDER_START_SRC);
      expect(src).not.toBe(EXERCISE_VISUAL_PLACEHOLDER_END_SRC);
    }
  });

  it("pairs each caption with its still URL (Start with start, End with end)", async () => {
    mockOpenLink(EXPIRY_STAYS_OPEN, [
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: { start_url: START_URL, end_url: END_URL },
      },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("public-link-exercise-print")).toBeInTheDocument();
    });
    const printRoot = screen.getByTestId("public-link-exercise-print");
    const startImg = printRoot.querySelector(".link-page-print-still--start img");
    const endImg = printRoot.querySelector(".link-page-print-still--end img");
    expect(
      printRoot.querySelector(".link-page-print-still--start figcaption")?.textContent,
    ).toBe(PRINT_START_CAPTION);
    expect(
      printRoot.querySelector(".link-page-print-still--end figcaption")?.textContent,
    ).toBe(PRINT_END_CAPTION);
    expect(startImg?.getAttribute("src")).toBe(START_URL);
    expect(endImg?.getAttribute("src")).toBe(END_URL);
    expect(startImg?.getAttribute("src")).not.toBe(END_URL);
    expect(endImg?.getAttribute("src")).not.toBe(START_URL);
  });

  it("hides carousel and video chrome from print while keeping on-screen carousel", async () => {
    mockOpenLink(EXPIRY_STAYS_OPEN, [
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: { start_url: START_URL, end_url: END_URL },
      },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("public-link-exercise-carousel")).toBeInTheDocument();
    });
    expect(document.querySelector(".link-page-carousel")).toHaveClass(
      "link-page-no-print",
    );
    const printRoot = screen.getByTestId("public-link-exercise-print");
    expect(printRoot.querySelector('[data-testid="exercise-motion-loop"]')).toBeNull();
    expect(printRoot.querySelector("video")).toBeNull();
  });

  it("shows print load failure for null media with pinned message and printable failed box", async () => {
    mockOpenLink(EXPIRY_STAYS_OPEN, [
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
      expect(screen.getByTestId("public-link-media-failed")).toBeInTheDocument();
    });
    expect(screen.getAllByText(IMAGES_DIDNT_LOAD)).toHaveLength(1);
    expect(screen.getByText(IMAGES_DIDNT_LOAD).textContent).toBe(IMAGES_DIDNT_LOAD);
    expect(screen.queryByTestId("public-link-exercise-print")).toBeNull();
    const failedBox = screen.getByTestId("public-link-media-failed");
    expect(failedBox).not.toHaveClass("link-page-no-print");
    assertNoScreenOnlyAncestor(failedBox);
    expect(document.querySelector(".link-page-media-retry")).toHaveClass(
      "link-page-no-print",
    );
  });

  it("drops print stills after a real image load error and keeps the failed box printable", async () => {
    mockOpenLink(EXPIRY_STAYS_OPEN, [
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: { start_url: START_URL, end_url: END_URL },
      },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("public-link-exercise-print")).toBeInTheDocument();
    });
    const startStill = document.querySelector(
      ".link-page-carousel-still, .link-page-carousel-motion img",
    ) as HTMLImageElement | null;
    const motionStart = document.querySelector(
      'img[src="https://cdn.example/heel-start.png"]',
    ) as HTMLImageElement;
    fireEvent.error(motionStart);

    await waitFor(() => {
      expect(screen.getByTestId("public-link-media-failed")).toBeInTheDocument();
    });
    expect(screen.getByText(IMAGES_DIDNT_LOAD).textContent).toBe(IMAGES_DIDNT_LOAD);
    expect(screen.queryByTestId("public-link-exercise-print")).toBeNull();
    const failedBox = screen.getByTestId("public-link-media-failed");
    expect(failedBox).not.toHaveClass("link-page-no-print");
    expect(startStill).toBeTruthy();
  });

  it("shows the expiry line on the web page only, not in the print-only blocks", async () => {
    mockOpenLink(EXPIRY_STAYS_OPEN, [
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: { start_url: START_URL, end_url: END_URL },
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText(EXPIRY_STAYS_OPEN)).toBeInTheDocument();
    });
    expect(document.querySelector(".link-page-footer")).toHaveClass(
      "link-page-no-print",
    );
    const printRoot = screen.getByTestId("public-link-exercise-print");
    expect(printRoot).not.toHaveTextContent(EXPIRY_STAYS_OPEN);
    expect(printRoot).not.toHaveTextContent(EXPIRY_UNTIL_DATE);
  });

  it("shows a dated expiry line on the web page and keeps it out of print-only blocks", async () => {
    mockOpenLink(EXPIRY_UNTIL_DATE, [
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: { start_url: START_URL, end_url: END_URL },
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText(EXPIRY_UNTIL_DATE)).toBeInTheDocument();
    });
    const printRoot = screen.getByTestId("public-link-exercise-print");
    expect(printRoot).not.toHaveTextContent(EXPIRY_UNTIL_DATE);
    expect(printRoot).not.toHaveTextContent(EXPIRY_STAYS_OPEN);
  });
});

describe("public link page print stylesheet (DIDI-1195)", () => {
  it("lays out three print columns with row span, spec literals, and screen hide", () => {
    const css = readFileSync(PRINT_STYLESHEET, "utf8");
    expect(css).toContain("@media print");
    expect(css).toMatch(/\.link-page-only-print\s*\{[^}]*display:\s*none\s*;[^}]*\}/);
    expect(css).toMatch(/\.link-page-no-print\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.link-page-only-print\s*\{[^}]*display:\s*contents/);
    expect(css).toMatch(
      /\.link-page-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+11rem\s+11rem/,
    );
    expect(css).toMatch(
      /\.link-page-print-still--start\s*\{[^}]*grid-row:\s*1\s*\/\s*span\s+3/,
    );
    expect(css).toMatch(
      /\.link-page-print-still--end\s*\{[^}]*grid-row:\s*1\s*\/\s*span\s+3/,
    );
    expect(css).toMatch(/\.link-page-media-failed\s*\{[^}]*grid-column:\s*2\s*\/\s*4/);
    expect(css).toMatch(
      /\.link-page-media-failed\s*\{[^}]*grid-row:\s*1\s*\/\s*span\s+3/,
    );
    expect(css).toMatch(/\.link-page-print-still-img\s*\{[^}]*object-fit:\s*cover/);
    expect(css).toMatch(/\.link-page-print-caption\s*\{[^}]*color:\s*#64748b/);
    expect(css).toMatch(/\.link-page-media-failed\s*\{[^}]*min-height:\s*8\.25rem/);
    expect(css).toMatch(
      /\.link-page-media-failed \.link-page-print-media-failed\s*\{[^}]*font-size:\s*13px/,
    );
    expect(css).toMatch(
      /\.link-page-media-failed \.link-page-print-media-failed\s*\{[^}]*color:\s*#64748b/,
    );
    expect(css).toMatch(/\.link-page-row\s*\{[^}]*break-inside:\s*avoid/);
    expect(css).not.toContain("exercise-motion");
  });
});
