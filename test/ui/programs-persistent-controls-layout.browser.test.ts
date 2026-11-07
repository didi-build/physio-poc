import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");
const ARTIFACTS_DIR = "/opt/cursor/artifacts";

async function waitForProgramsList(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="programs-list-controls"]', {
    state: "visible",
    timeout: 30_000,
  });
}

async function controlsAboveEmpty(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const controls = document.querySelector('[data-testid="programs-list-controls"]');
    const empty = document.querySelector('[data-testid="programs-empty"]');
    if (!controls || !empty) {
      return false;
    }
    const controlsBottom = controls.getBoundingClientRect().bottom;
    const emptyTop = empty.getBoundingClientRect().top;
    return controlsBottom <= emptyTop + 0.5;
  });
}

describe("Programs persistent controls layout (DIDI-1179)", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(() => {
    ensureLayoutHarnessBuilt();
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
  });

  beforeAll(async () => {
    const server = await startStaticFileServer(HARNESS_DIST);
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  afterAll(async () => {
    await closeServer?.();
  });

  it.each([
    { fixture: "programs-empty", screenshot: "programs-empty" },
    { fixture: "programs-no-match", screenshot: "programs-no-match" },
    { fixture: "programs-populated", screenshot: "programs-populated" },
  ] as const)(
    "captures $fixture with persistent controls at 390 and 1280 px",
    async ({ fixture, screenshot }) => {
      for (const width of [390, 1280]) {
        const browser = await chromium.launch();
        try {
          const page = await browser.newPage();
          await loadInterFontsInPage(page);
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}/?fixture=${fixture}`, { waitUntil: "load" });
          await waitForProgramsList(page);
          if (fixture === "programs-empty") {
            await page.waitForSelector('[data-testid="programs-empty"]', {
              state: "visible",
            });
            expect(await controlsAboveEmpty(page)).toBe(true);
          }
          if (fixture === "programs-no-match") {
            await page.waitForSelector(".pg-no-match", { state: "visible" });
          }
          if (fixture === "programs-populated") {
            await page.waitForSelector(".pg-card-list", { state: "visible" });
          }
          await page.screenshot({
            path: join(ARTIFACTS_DIR, `didi-1179-${screenshot}-${width}.png`),
            fullPage: true,
          });
        } finally {
          await browser.close();
        }
      }
    },
    120_000,
  );
});
