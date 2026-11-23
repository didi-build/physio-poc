import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStaticFileServer } from "../helpers/static-file-server.js";

const REPO_ROOT = process.cwd();

async function readPrintGridRows(
  page: Page,
  titleSelector: string,
  stillSelector: string,
) {
  return page.evaluate(
    ({ titleSel, stillSel }) => {
      const title = document.querySelector(titleSel) as HTMLElement | null;
      const description = document.querySelector(
        ".link-page-row-description",
      ) as HTMLElement | null;
      const still = document.querySelector(stillSel) as HTMLElement | null;
      if (!title || !description || !still) {
        return null;
      }
      const titleStyle = getComputedStyle(title);
      const descriptionStyle = getComputedStyle(description);
      const stillStyle = getComputedStyle(still);
      return {
        descriptionBelowTitle: description.offsetTop > title.offsetTop,
        descriptionSameColumn:
          titleStyle.gridColumnStart === descriptionStyle.gridColumnStart,
        stillGridRow: stillStyle.gridRow,
        titleGridColumn: titleStyle.gridColumn,
        descriptionGridColumn: descriptionStyle.gridColumn,
      };
    },
    { titleSel: titleSelector, stillSel: stillSelector },
  );
}

describe.each([390, 1280])(
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
        const layout = await readPrintGridRows(
          page,
          ".link-page-row-title",
          ".link-page-print-still--start",
        );
        expect(layout).not.toBeNull();
        expect(layout!.descriptionBelowTitle).toBe(true);
        expect(layout!.descriptionSameColumn).toBe(true);
        expect(layout!.titleGridColumn).toMatch(/^1\b/);
        expect(layout!.descriptionGridColumn).toMatch(/^1\b/);
        expect(layout!.stillGridRow).toBe("1 / span 5");
      } finally {
        await page.close();
        await browser.close();
      }
    });
  },
);
