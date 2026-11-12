import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLOSE_LINK_SHEET_TITLE,
  LINK_EXPIRES_HEADING,
  PHONE_SHARE,
  PUBLISH_SHEET_TITLE,
} from "../../src/ui/copy/program-publish.js";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";
import type { HarnessFixtureId } from "./harness/fixtures.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");
const ARTIFACTS_DIR = process.env.CI
  ? join(process.cwd(), "test-results/programs-didi-1014-layout-screenshots")
  : "/opt/cursor/artifacts";

type LayoutCapture = {
  mockup: string;
  fixture: HarnessFixtureId;
  fileStem: string;
  widths: readonly (390 | 1280)[];
  screenshot?: "viewport" | "sheet-panel";
  prepare?: (page: Page) => Promise<void>;
  ready?: (page: Page) => Promise<void>;
};

const HARNESS_THUMB =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PUBLIC_PREVIEW = {
  availability: "open" as const,
  program_name: "Knee osteoarthritis, starter",
  published_at: "2026-10-24T18:10:00.000Z",
  expiry_line: "Never expires.",
  rows: [
    {
      position: 0,
      title: "Heel slide",
      prescription_type: "stretching",
      params: { hold_s: 30 },
      note: "Slow and controlled",
      media: { start_url: HARNESS_THUMB, end_url: HARNESS_THUMB },
    },
    {
      position: 1,
      title: "Quad set",
      prescription_type: "isometric",
      params: { hold_s: 10 },
      note: null,
      media: null,
    },
  ],
};

const CAPTURES: LayoutCapture[] = [
  {
    mockup: "08",
    fixture: "programs-1014-publish-first",
    fileStem: "didi-1014-mockup-08-first-publish",
    widths: [390, 1280],
    ready: async (page) => {
      await page.getByRole("dialog", { name: PUBLISH_SHEET_TITLE }).waitFor({
        state: "visible",
      });
    },
  },
  {
    mockup: "22",
    fixture: "programs-1014-publish-name-required",
    fileStem: "didi-1014-mockup-22-name-required",
    widths: [390, 1280],
    ready: async (page) => {
      const dialog = page.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
      await dialog.waitFor({ state: "visible" });
      await dialog.getByRole("alert").waitFor({ state: "visible" });
    },
  },
  {
    mockup: "18",
    fixture: "programs-1014-publish-republish",
    fileStem: "didi-1014-mockup-18-republish-changes",
    widths: [390, 1280],
    ready: async (page) => {
      const dialog = page.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
      await dialog.waitFor({ state: "visible" });
      await dialog.getByRole("heading", { name: /^Changes since/ }).waitFor({
        state: "visible",
      });
    },
  },
  {
    mockup: "DIDI-1186 variant D",
    fixture: "programs-1014-publish-placeholders",
    fileStem: "didi-1014-mockup-placeholder-block-d",
    widths: [390, 1280],
    ready: async (page) => {
      const dialog = page.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
      await dialog.waitFor({ state: "visible" });
      await dialog
        .getByRole("heading", {
          name: "Approve or remove placeholders to publish",
        })
        .waitFor({ state: "visible" });
    },
  },
  {
    mockup: "12",
    fixture: "programs-1014-builder-sticky",
    fileStem: "didi-1014-mockup-12-sticky-publish-card",
    widths: [1280],
    ready: async (page) => {
      await page.locator(".pg-builder").waitFor({ state: "visible" });
      await page.locator(".pg-publish-card--desktop").scrollIntoViewIfNeeded();
    },
  },
  {
    mockup: "30",
    fixture: "programs-1014-share-open",
    fileStem: "didi-1014-mockup-30-share-open",
    widths: [390, 1280],
    ready: async (page) => {
      await page.getByRole("heading", { level: 1, name: "Share program" }).waitFor({
        state: "visible",
      });
      const width = page.viewportSize()?.width ?? 1280;
      if (width < 1024) {
        await page.getByRole("button", { name: PHONE_SHARE }).waitFor({
          state: "visible",
        });
        expect(await page.locator(".pg-share-aside-slot").isVisible()).toBe(false);
      } else {
        await page.getByRole("button", { name: /Download PDF/ }).waitFor({
          state: "visible",
        });
      }
    },
  },
  {
    mockup: "31",
    fixture: "programs-1014-share-open",
    fileStem: "didi-1014-mockup-31-share-link-sheet",
    widths: [390],
    screenshot: "sheet-panel",
    prepare: async (page) => {
      await page.getByRole("button", { name: PHONE_SHARE }).click();
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: LINK_EXPIRES_HEADING }).waitFor({
        state: "visible",
      });
    },
  },
  {
    mockup: "31 actions",
    fixture: "programs-1014-share-open",
    fileStem: "didi-1014-mockup-31-share-link-sheet-actions",
    widths: [390],
    screenshot: "sheet-panel",
    prepare: async (page) => {
      await page.getByRole("button", { name: PHONE_SHARE }).click();
      const body = page.locator(".shell-sheet-body");
      await body.waitFor({ state: "visible" });
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
    },
    ready: async (page) => {
      await page.getByRole("button", { name: /Download PDF/ }).waitFor({
        state: "visible",
      });
      await page.getByRole("button", { name: /Close link/ }).waitFor({
        state: "visible",
      });
    },
  },
  {
    mockup: "33",
    fixture: "programs-1014-share-closed",
    fileStem: "didi-1014-mockup-33-share-closed",
    widths: [390, 1280],
    ready: async (page) => {
      await page.getByRole("heading", { level: 1, name: "Share program" }).waitFor({
        state: "visible",
      });
      await page
        .getByText('Anyone who opens the old link sees a "This link was closed" page.')
        .waitFor({ state: "visible" });
    },
  },
  {
    mockup: "32",
    fixture: "programs-1014-share-open",
    fileStem: "didi-1014-mockup-32-close-link-confirm",
    widths: [390, 1280],
    prepare: async (page) => {
      const width = page.viewportSize()?.width ?? 1280;
      if (width < 1024) {
        await page.getByRole("button", { name: PHONE_SHARE }).click();
        await page.getByRole("dialog", { name: "Share program" }).waitFor({
          state: "visible",
        });
      }
      await page.getByRole("button", { name: /Close link/ }).click();
      await page.getByRole("dialog", { name: CLOSE_LINK_SHEET_TITLE }).waitFor({
        state: "visible",
      });
    },
    ready: async (page) => {
      await page.getByRole("dialog", { name: CLOSE_LINK_SHEET_TITLE }).waitFor({
        state: "visible",
      });
    },
  },
];

async function installSharePreviewRoute(page: Page): Promise<void> {
  await page.route("**/api/public/share-links/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PUBLIC_PREVIEW),
    });
  });
}

async function captureFixture(
  browser: Browser,
  baseUrl: string,
  capture: LayoutCapture,
  width: 390 | 1280,
): Promise<void> {
  const page = await browser.newPage();
  try {
    await loadInterFontsInPage(page);
    await installSharePreviewRoute(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/?fixture=${capture.fixture}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(`[data-layout-root="${capture.fixture}"]`, {
      timeout: 60_000,
    });
    if (capture.prepare) {
      await capture.prepare(page);
    }
    if (capture.ready) {
      await capture.ready(page);
    }
    const suffix = width === 390 ? "390" : "1280";
    const path = join(ARTIFACTS_DIR, `${capture.fileStem}-${suffix}.png`);
    if (capture.screenshot === "sheet-panel") {
      await page.locator(".shell-sheet-panel").screenshot({ path });
    } else {
      await page.screenshot({ path, fullPage: true });
    }
    expect(path).toBeTruthy();
  } finally {
    await page.close();
  }
}

describe("Programs publish/share layout (DIDI-1014 mockups)", () => {
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

  it("captures publish, share, and sticky publish screens at 390 and 1280 px", async () => {
    const browser = await chromium.launch();
    try {
      for (const capture of CAPTURES) {
        for (const width of capture.widths) {
          await captureFixture(browser, baseUrl, capture, width);
        }
      }
    } finally {
      await browser.close();
    }
  }, 300_000);
});
