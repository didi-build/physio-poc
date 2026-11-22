import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";
import {
  TYPE_MISMATCH_DIDNT_LINK_BADGE,
  typeMismatchShowMeAriaLabel,
} from "../../src/ui/copy/program-type-mismatch.js";
import { PUBLISH_SHEET_TITLE } from "../../src/ui/copy/program-publish.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");
const ARTIFACTS_DIR = process.env.CI
  ? join(process.cwd(), "test-results/programs-didi-1106-layout-screenshots")
  : "/opt/cursor/artifacts";

async function captureFixture(
  browser: Browser,
  baseUrl: string,
  width: 390 | 1280,
): Promise<void> {
  const page = await browser.newPage();
  try {
    await loadInterFontsInPage(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/?fixture=programs-1106-type-mismatch`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector('[data-layout-root="programs-1106-type-mismatch"]', {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: typeMismatchShowMeAriaLabel() })
      .waitFor({ state: "visible" });
    const suffix = width === 390 ? "390" : "1280";
    const path = join(ARTIFACTS_DIR, `didi-1106-type-mismatch-builder-${suffix}.png`);
    await page.screenshot({ path, fullPage: true });
    expect(path).toBeTruthy();
  } finally {
    await page.close();
  }
}

describe("Programs type-mismatch builder layout (DIDI-1106)", () => {
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

  it("captures the builder with a type-mismatch banner at 390 and 1280 px", async () => {
    const browser = await chromium.launch();
    try {
      await captureFixture(browser, baseUrl, 390);
      await captureFixture(browser, baseUrl, 1280);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it("captures the publish sheet with a Didn't link row at 390 and 1280 px", async () => {
    const browser = await chromium.launch();
    try {
      for (const width of [390, 1280] as const) {
        const page = await browser.newPage();
        try {
          await loadInterFontsInPage(page);
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}/?fixture=programs-1106-publish-type-mismatch`, {
            waitUntil: "domcontentloaded",
          });
          await page.waitForSelector(
            '[data-layout-root="programs-1106-publish-type-mismatch"]',
            {
              timeout: 60_000,
            },
          );
          await page.getByRole("dialog", { name: PUBLISH_SHEET_TITLE }).waitFor({
            state: "visible",
          });
          await page
            .getByRole("dialog", { name: PUBLISH_SHEET_TITLE })
            .getByText(TYPE_MISMATCH_DIDNT_LINK_BADGE, { exact: true })
            .waitFor({ state: "visible" });
          await page.screenshot({
            path: join(ARTIFACTS_DIR, `didi-1106-publish-type-mismatch-${width}.png`),
            fullPage: true,
          });
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }, 120_000);
});
