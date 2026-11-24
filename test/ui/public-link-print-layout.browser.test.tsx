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

const FIXTURE_PRINT_CLASS_NAMES = [
  "link-page-only-print",
  "link-page-print-still",
  "link-page-print-still--start",
  "link-page-print-still--end",
  "link-page-print-still-img",
] as const;

async function readPrintColumnStack(page: Page) {
  return page.evaluate(() => {
    const title = document.querySelector(".link-page-row-title") as HTMLElement | null;
    const description = document.querySelector(
      ".link-page-row-description",
    ) as HTMLElement | null;
    const startStill = document.querySelector(
      ".link-page-print-still--start",
    ) as HTMLElement | null;
    const endStill = document.querySelector(
      ".link-page-print-still--end",
    ) as HTMLElement | null;
    const failedCell = document.querySelector(
      ".link-page-media-failed",
    ) as HTMLElement | null;
    if (!title || !description || !startStill) {
      return null;
    }
    const titleStyle = getComputedStyle(title);
    const descriptionStyle = getComputedStyle(description);
    const startStyle = getComputedStyle(startStill);
    const endStyle = endStill ? getComputedStyle(endStill) : null;
    const failedStyle = failedCell ? getComputedStyle(failedCell) : null;
    const titleRect = title.getBoundingClientRect();
    const descriptionRect = description.getBoundingClientRect();
    const stillRect = startStill.getBoundingClientRect();
    return {
      descriptionBelowTitle: descriptionRect.top >= titleRect.bottom - 1,
      descriptionAboveStillBottom: descriptionRect.bottom <= stillRect.bottom + 1,
      descriptionSameColumn:
        titleStyle.gridColumnStart === descriptionStyle.gridColumnStart,
      startStillGridRow: startStyle.gridRow,
      endStillGridRow: endStyle?.gridRow ?? null,
      failedMediaGridRow: failedStyle?.gridRow ?? null,
      titleGridColumn: titleStyle.gridColumn,
      descriptionGridColumn: descriptionStyle.gridColumn,
    };
  });
}

describe("DIDI-1283 public link print fixture matches row markup", () => {
  afterAll(() => {
    cleanup();
  });

  it("uses the same print still class names as PublicLinkExerciseRow", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { container: rowHost } = render(
      <PublicLinkExerciseRow
        title="Heel slide"
        description="Gentle knee flexion stretch for patients."
        startingPosition="Supine."
        endingPosition=""
        prescriptionType="stretching"
        params={{ hold_s: 30 }}
        note={null}
        media={{
          start_url: "https://cdn.example/start.png",
          end_url: "https://cdn.example/end.png",
        }}
      />,
      { container },
    );
    for (const className of FIXTURE_PRINT_CLASS_NAMES) {
      expect(rowHost.querySelector(`.${className}`)).not.toBeNull();
    }
    expect(
      rowHost.querySelector(
        ".link-page-row-description.link-page-row-description--grid",
      ),
    ).not.toBeNull();
    document.body.removeChild(container);
  });
});

function gridColumnStartsAtOne(gridColumn: string): boolean {
  const start = gridColumn.split("/")[0]?.trim() ?? "";
  return start === "1";
}

describe.each([390, 800])(
  "DIDI-1283 public link print column stack at %i px",
  (widthPx) => {
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

    it("keeps description directly under the title in print layout", async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: widthPx, height: 900 } });
      try {
        await page.goto(`${baseUrl}/test/fixtures/public-link-print-grid/index.html`, {
          waitUntil: "networkidle",
        });
        await page.emulateMedia({ media: "print" });
        const layout = await readPrintColumnStack(page);
        expect(layout).not.toBeNull();
        expect(layout!.descriptionBelowTitle).toBe(true);
        expect(layout!.descriptionAboveStillBottom).toBe(true);
        expect(layout!.descriptionSameColumn).toBe(true);
        expect(gridColumnStartsAtOne(layout!.titleGridColumn)).toBe(true);
        expect(gridColumnStartsAtOne(layout!.descriptionGridColumn)).toBe(true);
        expect(layout!.startStillGridRow).toBe("1 / span 5");
        expect(layout!.endStillGridRow).toBe("1 / span 5");
      } finally {
        await page.close();
        await browser.close();
      }
    });

    it("spans print stills and failed-media cell across five grid rows", async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: widthPx, height: 900 } });
      try {
        await page.goto(
          `${baseUrl}/test/fixtures/public-link-print-grid/failed-media.html`,
          {
            waitUntil: "networkidle",
          },
        );
        await page.emulateMedia({ media: "print" });
        const failedGridRow = await page.evaluate(() => {
          const failed = document.querySelector(
            ".link-page-media-failed",
          ) as HTMLElement | null;
          return failed ? getComputedStyle(failed).gridRow : null;
        });
        expect(failedGridRow).toBe("1 / span 5");
      } finally {
        await page.close();
        await browser.close();
      }
    });
  },
);
