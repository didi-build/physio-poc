import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");
const ARTIFACTS_DIR = process.env.CI
  ? join(process.cwd(), "test-results/programs-layout-screenshots")
  : "/opt/cursor/artifacts";

const LAYOUT_CASES = (
  [
    { fixture: "programs-empty", screenshot: "programs-empty" },
    { fixture: "programs-no-match", screenshot: "programs-no-match" },
    { fixture: "programs-populated", screenshot: "programs-populated" },
  ] as const
).flatMap((entry) => ([390, 1280] as const).map((width) => ({ ...entry, width })));

async function waitForProgramsList(page: Page): Promise<void> {
  await page.waitForSelector("#programs-heading", {
    state: "visible",
    timeout: 60_000,
  });
  await page.waitForSelector('[data-testid="programs-list-controls"]', {
    state: "visible",
    timeout: 60_000,
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

async function captureFixtureWidth(
  browser: Browser,
  baseUrl: string,
  { fixture, screenshot, width }: (typeof LAYOUT_CASES)[number],
): Promise<void> {
  const page = await browser.newPage();
  try {
    await loadInterFontsInPage(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/?fixture=${fixture}`, {
      waitUntil: "domcontentloaded",
    });
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
      await page.waitForSelector(".pg-card-list a", { state: "visible" });
    }
    await page.screenshot({
      path: join(ARTIFACTS_DIR, `didi-1179-${screenshot}-${width}.png`),
      fullPage: true,
    });
  } finally {
    await page.close();
  }
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

  it("captures empty, no-match, and populated programs with persistent controls at 390 and 1280 px", async () => {
    const browser = await chromium.launch();
    try {
      for (const layoutCase of LAYOUT_CASES) {
        await captureFixtureWidth(browser, baseUrl, layoutCase);
      }
    } finally {
      await browser.close();
    }
  }, 300_000);
});
