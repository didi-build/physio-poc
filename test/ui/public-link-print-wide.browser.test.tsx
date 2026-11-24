/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { startStaticFileServer } from "../helpers/static-file-server.js";
import { PublicLinkExerciseRow } from "../../src/ui/link-page/PublicLinkExerciseRow.js";

const REPO_ROOT = process.cwd();
const FIXTURE_URL_PATH = "/test/fixtures/public-link-print-wide/index.html";

const TEXT_COLUMN_SELECTOR = [
  ".link-page-row-title",
  ".link-page-row-description",
  ".link-page-positions",
  ".link-page-dose",
  ".link-page-row-note",
] as const;

type TextColumnLayout = {
  leftEdges: number[];
  tops: number[];
  bottoms: number[];
};

async function readTextColumnLayout(page: Page): Promise<TextColumnLayout | null> {
  return page.evaluate(
    (selectors) => {
      const nodes = selectors
        .map((selector) => document.querySelector(selector))
        .filter((node): node is HTMLElement => node instanceof HTMLElement);
      if (nodes.length !== selectors.length) {
        return null;
      }
      const leftEdges: number[] = [];
      const tops: number[] = [];
      const bottoms: number[] = [];
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        leftEdges.push(rect.left);
        tops.push(rect.top);
        bottoms.push(rect.bottom);
      }
      return { leftEdges, tops, bottoms };
    },
    [...TEXT_COLUMN_SELECTOR],
  );
}

async function readDesktopTextColumnGridAreas(page: Page) {
  return page.evaluate(() => {
    const readArea = (selector: string) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node).gridArea : null;
    };
    return {
      title: readArea(".link-page-row-title"),
      description: readArea(".link-page-row-description--grid"),
      positions: readArea(".link-page-positions--grid"),
      dose: readArea(".link-page-dose"),
      note: readArea(".link-page-row-note"),
      rowDisplay: getComputedStyle(document.querySelector(".link-page-row") as Element)
        .display,
      rowColumns: getComputedStyle(document.querySelector(".link-page-row") as Element)
        .gridTemplateColumns,
    };
  });
}

async function openFixture(
  page: Page,
  baseUrl: string,
  widthPx: number,
): Promise<void> {
  await page.setViewportSize({ width: widthPx, height: 900 });
  await page.goto(`${baseUrl}${FIXTURE_URL_PATH}`, { waitUntil: "networkidle" });
}

async function readPrintTextColumnStarts(page: Page): Promise<string[] | null> {
  return page.evaluate(
    (selectors) => {
      const nodes = selectors
        .map((selector) => document.querySelector(selector))
        .filter((node): node is HTMLElement => node instanceof HTMLElement);
      if (nodes.length !== selectors.length) {
        return null;
      }
      return nodes.map((node) => getComputedStyle(node).gridColumnStart);
    },
    [...TEXT_COLUMN_SELECTOR],
  );
}

describe("DIDI-1296 public link print wide fixture matches row markup", () => {
  afterAll(() => {
    cleanup();
  });

  it("uses the same text column class names as PublicLinkExerciseRow", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { container: rowHost } = render(
      <PublicLinkExerciseRow
        title="Heel slide"
        description="Gentle knee flexion stretch for patients."
        startingPosition="Supine with knee bent."
        endingPosition="Knee extended flat."
        prescriptionType="stretching"
        params={{ hold_s: 30 }}
        note="Slow and controlled."
        media={{
          start_url: "https://cdn.example/start.png",
          end_url: "https://cdn.example/end.png",
        }}
      />,
      { container },
    );
    for (const selector of TEXT_COLUMN_SELECTOR) {
      expect(rowHost.querySelector(selector)).not.toBeNull();
    }
    document.body.removeChild(container);
  });
});

describe("DIDI-1296 public link print text column at wide print width", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const server = await startStaticFileServer(REPO_ROOT);
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  afterAll(async () => {
    await closeServer();
  });

  it.each([390, 800, 1280] as const)(
    "places title, description, positions, dose and note in print column 1 at %i px",
    async (widthPx) => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      try {
        await openFixture(page, baseUrl, widthPx);
        await page.emulateMedia({ media: "print" });
        const columnStarts = await readPrintTextColumnStarts(page);
        expect(columnStarts).not.toBeNull();
        expect(columnStarts).toEqual(["1", "1", "1", "1", "1"]);
      } finally {
        await page.close();
        await browser.close();
      }
    },
  );

  it("does not stack title, description, positions, dose and note at 1280 px print", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await openFixture(page, baseUrl, 1280);
      await page.emulateMedia({ media: "print" });
      const layout = await readTextColumnLayout(page);
      expect(layout).not.toBeNull();
      const overlapPairs = await page.evaluate(
        (selectors) => {
          const nodes = selectors
            .map((selector) => document.querySelector(selector))
            .filter((node): node is HTMLElement => node instanceof HTMLElement);
          const overlaps: string[] = [];
          for (let i = 0; i < nodes.length; i += 1) {
            for (let j = i + 1; j < nodes.length; j += 1) {
              const a = nodes[i]!.getBoundingClientRect();
              const b = nodes[j]!.getBoundingClientRect();
              const epsilon = 0.5;
              const separated =
                a.bottom <= b.top + epsilon ||
                b.bottom <= a.top + epsilon ||
                a.right <= b.left + epsilon ||
                b.right <= a.left + epsilon;
              if (!separated) {
                overlaps.push(`${selectors[i]} vs ${selectors[j]}`);
              }
            }
          }
          return overlaps;
        },
        [...TEXT_COLUMN_SELECTOR],
      );
      expect(overlapPairs).toEqual([]);
      for (let i = 0; i < layout!.tops.length - 1; i += 1) {
        expect(layout!.tops[i + 1]).toBeGreaterThanOrEqual(layout!.bottoms[i]! - 1);
      }
    } finally {
      await page.close();
      await browser.close();
    }
  });

  it("matches the narrow print column stack at 1280 px", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await openFixture(page, baseUrl, 390);
      await page.emulateMedia({ media: "print" });
      const narrowLayout = await readTextColumnLayout(page);
      expect(narrowLayout).not.toBeNull();

      await openFixture(page, baseUrl, 1280);
      await page.emulateMedia({ media: "print" });
      const wideLayout = await readTextColumnLayout(page);
      expect(wideLayout).not.toBeNull();

      for (const edges of [narrowLayout!.leftEdges, wideLayout!.leftEdges]) {
        const uniqueLeft = new Set(edges.map((value) => Math.round(value)));
        expect(uniqueLeft.size).toBe(1);
      }
      expect(Math.round(wideLayout!.leftEdges[0]!)).toBe(
        Math.round(narrowLayout!.leftEdges[0]!),
      );
      for (const layout of [narrowLayout!, wideLayout!]) {
        for (let i = 0; i < layout.tops.length - 1; i += 1) {
          expect(layout.tops[i + 1]).toBeGreaterThanOrEqual(layout.bottoms[i]! - 1);
        }
      }
    } finally {
      await page.close();
      await browser.close();
    }
  });

  it.each([390, 800] as const)(
    "keeps the text column stack order in print at %i px",
    async (widthPx) => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      try {
        await openFixture(page, baseUrl, widthPx);
        await page.emulateMedia({ media: "print" });
        const layout = await readTextColumnLayout(page);
        expect(layout).not.toBeNull();
        for (let i = 0; i < layout!.tops.length - 1; i += 1) {
          expect(layout!.tops[i + 1]).toBeGreaterThanOrEqual(layout!.bottoms[i]! - 1);
        }
        const uniqueLeft = new Set(layout!.leftEdges.map((value) => Math.round(value)));
        expect(uniqueLeft.size).toBe(1);
      } finally {
        await page.close();
        await browser.close();
      }
    },
  );
});

describe("DIDI-1296 public link screen layout at 1024 px and above", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const server = await startStaticFileServer(REPO_ROOT);
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  afterAll(async () => {
    await closeServer();
  });

  it("keeps the desktop grid areas on screen at 1280 px", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await openFixture(page, baseUrl, 1280);
      await page.emulateMedia({ media: "screen" });
      const grid = await readDesktopTextColumnGridAreas(page);
      expect(grid.rowDisplay).toBe("grid");
      expect(grid.rowColumns.split(" ").length).toBe(2);
      expect(grid.title).toBe("title");
      expect(grid.description).toBe("description");
      expect(grid.positions).toBe("positions");
      expect(grid.dose).toBe("dose");
      expect(grid.note).toBe("note");
    } finally {
      await page.close();
      await browser.close();
    }
  });
});
