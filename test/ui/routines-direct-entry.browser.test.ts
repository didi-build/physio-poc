import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");

async function waitForDetail(page: Page): Promise<void> {
  await page.waitForSelector(".rt-detail", { state: "visible", timeout: 30_000 });
}

async function waitForMyCopy(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="save-my-copy"]', {
    state: "visible",
    timeout: 30_000,
  });
}

describe("Routines direct entry (browser, DIDI-1022)", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    await ensureLayoutHarnessBuilt();
    const server = await startStaticFileServer(HARNESS_DIST);
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  afterAll(async () => {
    await closeServer?.();
  });

  it.each([
    {
      fixture: "routines-detail-update",
      ready: waitForDetail,
      assertNoListSearch: true,
      title: "Knee starter",
    },
    {
      fixture: "routines-my-copy-direct",
      ready: waitForMyCopy,
      assertNoListSearch: true,
      title: "Knee starter",
    },
    {
      fixture: "routines-detail-load-failed",
      ready: async (page: Page) => {
        await page.waitForSelector(
          '[data-testid="exercise-library-detail-error-slot"]',
          {
            state: "attached",
            timeout: 30_000,
          },
        );
      },
      assertNoListSearch: true,
      title: null,
    },
  ] as const)(
    "$fixture direct entry at 390 and 1280 px",
    async ({ fixture, ready, assertNoListSearch, title }) => {
      for (const width of [390, 1280]) {
        const browser = await chromium.launch();
        try {
          const page = await browser.newPage();
          await loadInterFontsInPage(page);
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}/?fixture=${fixture}`, { waitUntil: "load" });
          await ready(page);

          if (title) {
            const titleText = await page.locator(".ex-page-title").textContent();
            expect(titleText).toContain(title);
          }
          if (assertNoListSearch) {
            const searchCount = await page
              .getByRole("searchbox", { name: "Search routines" })
              .count();
            expect(searchCount).toBe(0);
          }
        } finally {
          await browser.close();
        }
      }
    },
    120_000,
  );
});
