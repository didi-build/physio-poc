/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicLinkPage } from "../../src/ui/pages/PublicLinkPage.js";
import {
  PUBLIC_LINK_CAROUSEL_END,
  PUBLIC_LINK_CAROUSEL_START,
  PUBLIC_LINK_IMAGES_DIDNT_LOAD,
} from "../../src/copy/programs-share.js";
import {
  EXERCISE_VISUAL_PLACEHOLDER_END_SRC,
  EXERCISE_VISUAL_PLACEHOLDER_START_SRC,
} from "../../src/ui/exercise-visual/placeholders.js";
import {
  exerciseMotionEndAlt,
  exerciseMotionStartAlt,
} from "../../src/ui/exercise-motion/timing.js";

const PRINT_STYLESHEET = join(process.cwd(), "src/ui/styles/public-link-page.css");

const EXPIRY_STAYS_OPEN =
  "This link stays open until your physiotherapist closes it." as const;
const EXPIRY_UNTIL_DATE = "This link works until Apr 1, 2026." as const;

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Public link page print layout (DIDI-1195)", () => {
  it("renders real start and end image URLs in the print-only block per row", async () => {
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
    const printImgs = printRoot.querySelectorAll("img");
    expect(printImgs).toHaveLength(2);
    expect(printImgs[0]?.getAttribute("src")).toBe(START_URL);
    expect(printImgs[1]?.getAttribute("src")).toBe(END_URL);
    expect(printImgs[0]?.getAttribute("alt")).toBe(
      exerciseMotionStartAlt("Heel slide"),
    );
    expect(printImgs[1]?.getAttribute("alt")).toBe(exerciseMotionEndAlt("Heel slide"));
    expect(printRoot).toHaveTextContent(PUBLIC_LINK_CAROUSEL_START);
    expect(printRoot).toHaveTextContent(PUBLIC_LINK_CAROUSEL_END);
    for (const img of printImgs) {
      const src = img.getAttribute("src") ?? "";
      expect(src).not.toBe(EXERCISE_VISUAL_PLACEHOLDER_START_SRC);
      expect(src).not.toBe(EXERCISE_VISUAL_PLACEHOLDER_END_SRC);
    }
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
    expect(screen.getByTestId("public-link-exercise-print")).not.toHaveClass(
      "link-page-no-print",
    );
    const printRoot = screen.getByTestId("public-link-exercise-print");
    expect(printRoot.querySelector('[data-testid="exercise-motion-loop"]')).toBeNull();
    expect(printRoot.querySelector(".link-page-carousel")).toBeNull();
    expect(printRoot.querySelector("video")).toBeNull();
  });

  it("shows print load failure across image columns without Try again", async () => {
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
    expect(screen.getAllByText(PUBLIC_LINK_IMAGES_DIDNT_LOAD)).toHaveLength(1);
    expect(screen.queryByTestId("public-link-exercise-print")).toBeNull();
    expect(document.querySelector(".link-page-media-failed")).toBeTruthy();
    expect(document.querySelector(".link-page-print-media-failed")).toBeTruthy();
    expect(document.querySelector(".link-page-media-retry")).toHaveClass(
      "link-page-no-print",
    );
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
  it("lays out three print columns and keeps carousel chrome out of print CSS", () => {
    const css = readFileSync(PRINT_STYLESHEET, "utf8");
    expect(css).toContain("@media print");
    expect(css).toMatch(/\.link-page-no-print\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.link-page-only-print\s*\{[^}]*display:\s*contents/);
    expect(css).toMatch(
      /\.link-page-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+11rem\s+11rem/,
    );
    expect(css).toMatch(/\.link-page-print-still--start\s*\{[^}]*grid-column:\s*2/);
    expect(css).toMatch(/\.link-page-print-still--end\s*\{[^}]*grid-column:\s*3/);
    expect(css).toMatch(
      /@media print[\s\S]*\.link-page-media-failed\s*\{[^}]*grid-column:\s*2\s*\/\s*4/,
    );
    expect(css).toMatch(/\.link-page-row\s*\{[^}]*break-inside:\s*avoid/);
    expect(css).not.toContain("exercise-motion");
  });
});
