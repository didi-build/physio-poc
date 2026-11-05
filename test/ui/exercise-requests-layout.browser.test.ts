import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";
import type { HarnessFixtureId } from "./harness/fixtures.js";
import { REGENERATE } from "../../src/ui/copy/exercise-requests.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");

async function waitForScreen(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { state: "visible", timeout: 30_000 });
}

async function readShellFrameOverflow(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector(".shell-frame") as HTMLElement | null;
    if (!frame) {
      return null;
    }
    return { clientWidth: frame.clientWidth, scrollWidth: frame.scrollWidth };
  });
}

async function readPageOverflow(page: Page) {
  return page.evaluate(() => {
    const pageEl = document.querySelector(".ex-page") as HTMLElement | null;
    if (!pageEl) {
      return null;
    }
    return { clientWidth: pageEl.clientWidth, scrollWidth: pageEl.scrollWidth };
  });
}

async function readSimilarRowActionBounds(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector(".ex-similar-row") as HTMLElement | null;
    const action = row?.querySelector(
      ".ex-secondary-btn, .ex-primary-btn",
    ) as HTMLElement | null;
    if (!row || !action) {
      return null;
    }
    const rowBox = row.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    const style = getComputedStyle(row);
    const padLeft = Number.parseFloat(style.paddingLeft);
    const padRight = Number.parseFloat(style.paddingRight);
    const contentRight = rowBox.right - padRight;
    const contentLeft = rowBox.left + padLeft;
    return {
      actionRight: actionBox.right,
      contentRight,
      contentLeft,
      actionLeft: actionBox.left,
      rowScrollWidth: row.scrollWidth,
      rowClientWidth: row.clientWidth,
    };
  });
}

async function readFlexDirection(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      return null;
    }
    return getComputedStyle(el).flexDirection;
  }, selector);
}

async function readGridColumnCount(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      return null;
    }
    const columns = getComputedStyle(el).gridTemplateColumns;
    if (!columns || columns === "none") {
      return 0;
    }
    return columns.split(" ").filter((part) => part.trim().length > 0).length;
  }, selector);
}

async function readRequestSubmitBounds(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector(".ex-request-form") as HTMLElement | null;
    const button = document.querySelector(".ex-request-submit") as HTMLElement | null;
    if (!form || !button) {
      return null;
    }
    const formBox = form.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const padLeft = Number.parseFloat(getComputedStyle(form).paddingLeft);
    const padRight = Number.parseFloat(getComputedStyle(form).paddingRight);
    return {
      buttonRight: buttonBox.right,
      contentRight: formBox.right - padRight,
      buttonLeft: buttonBox.left,
      contentLeft: formBox.left + padLeft,
      formScrollWidth: form.scrollWidth,
      formClientWidth: form.clientWidth,
    };
  });
}

describe("Exercise requests layout (real browser, DIDI-1009)", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(() => {
    if (!existsSync(join(HARNESS_DIST, "index.html"))) {
      execSync("npx vite build --config vite.layout-harness.config.ts", {
        stdio: "inherit",
      });
    }
  });

  beforeAll(async () => {
    const server = await startStaticFileServer(HARNESS_DIST);
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  afterAll(async () => {
    await closeServer?.();
  });

  const fixtures: {
    id: HarnessFixtureId | "request-submitted";
    readySelector: string;
  }[] = [
    { id: "search-similar", readySelector: "#ex-similar-heading" },
    { id: "request-form", readySelector: ".ex-request-form" },
    {
      id: "request-submitted",
      readySelector: "[data-layout-screen='request-submitted']",
    },
    { id: "conflict", readySelector: "#ex-conflict-heading" },
    { id: "requests-list", readySelector: "#ex-requests-heading" },
    { id: "draft-review", readySelector: "#ex-review-heading" },
  ];

  it.each(
    fixtures.flatMap((fixture) => [390, 1280].map((width) => ({ ...fixture, width }))),
  )(
    "keeps $id within the shell frame at $width px",
    async ({ id, readySelector, width }) => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${baseUrl}/?fixture=${id}`, { waitUntil: "load" });
        await waitForScreen(page, readySelector);

        const frame = await readShellFrameOverflow(page);
        expect(frame).not.toBeNull();
        expect(frame!.scrollWidth).toBeLessThanOrEqual(frame!.clientWidth + 1);

        const pageBox = await readPageOverflow(page);
        expect(pageBox).not.toBeNull();
        expect(pageBox!.scrollWidth).toBeLessThanOrEqual(pageBox!.clientWidth + 1);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it.each([390, 1280])(
    "keeps similar-row actions inside the row card at %i px",
    async (width) => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${baseUrl}/?fixture=search-similar`, {
          waitUntil: "load",
        });
        await waitForScreen(page, "#ex-similar-heading");

        const bounds = await readSimilarRowActionBounds(page);
        expect(bounds).not.toBeNull();
        expect(bounds!.actionLeft).toBeGreaterThanOrEqual(bounds!.contentLeft - 0.5);
        expect(bounds!.actionRight).toBeLessThanOrEqual(bounds!.contentRight + 0.5);
        expect(bounds!.rowScrollWidth).toBeLessThanOrEqual(bounds!.rowClientWidth + 1);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it.each([390, 1280])(
    "keeps the request submit button inside the form card at %i px",
    async (width) => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${baseUrl}/?fixture=request-form`, {
          waitUntil: "load",
        });
        await waitForScreen(page, ".ex-request-form");

        const bounds = await readRequestSubmitBounds(page);
        expect(bounds).not.toBeNull();
        expect(bounds!.buttonLeft).toBeGreaterThanOrEqual(bounds!.contentLeft - 0.5);
        expect(bounds!.buttonRight).toBeLessThanOrEqual(bounds!.contentRight + 0.5);
        expect(bounds!.formScrollWidth).toBeLessThanOrEqual(
          bounds!.formClientWidth + 1,
        );
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it("uses a column requests row on phone and a row layout on desktop", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await loadInterFontsInPage(page);

      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(`${baseUrl}/?fixture=requests-list`, {
        waitUntil: "load",
      });
      await waitForScreen(page, "#ex-requests-heading");
      await waitForScreen(page, ".ex-requests-row");
      expect(await readFlexDirection(page, ".ex-requests-row")).toBe("column");

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${baseUrl}/?fixture=requests-list`, {
        waitUntil: "load",
      });
      await waitForScreen(page, "#ex-requests-heading");
      await waitForScreen(page, ".ex-requests-row");
      expect(await readFlexDirection(page, ".ex-requests-row")).toBe("row");
    } finally {
      await browser.close();
    }
  }, 120_000);

  it("uses a column conflict footer on phone and a row layout on desktop", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await loadInterFontsInPage(page);

      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(`${baseUrl}/?fixture=conflict`, { waitUntil: "load" });
      await waitForScreen(page, "#ex-conflict-heading");
      expect(await readFlexDirection(page, ".ex-conflict-footer")).toBe("column");

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${baseUrl}/?fixture=conflict`, { waitUntil: "load" });
      await waitForScreen(page, "#ex-conflict-heading");
      expect(await readFlexDirection(page, ".ex-conflict-footer")).toBe("row");
    } finally {
      await browser.close();
    }
  }, 120_000);

  it("uses a single-column draft review grid on phone and two columns on desktop", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await loadInterFontsInPage(page);

      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(`${baseUrl}/?fixture=draft-review`, { waitUntil: "load" });
      await waitForScreen(page, ".ex-review-grid");
      expect(await readGridColumnCount(page, ".ex-review-grid")).toBe(1);

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${baseUrl}/?fixture=draft-review`, { waitUntil: "load" });
      await waitForScreen(page, ".ex-review-grid");
      expect(await readGridColumnCount(page, ".ex-review-grid")).toBe(2);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it.each([390, 1280])(
    "keeps the regenerate sheet panel inside the viewport at %i px",
    async (width) => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${baseUrl}/?fixture=draft-review`, {
          waitUntil: "load",
        });
        await waitForScreen(page, "#ex-review-heading");
        await page.getByRole("button", { name: REGENERATE, exact: true }).click();
        await waitForScreen(page, ".shell-sheet-panel");

        const panelMetrics = await page.evaluate(() => {
          const panel = document.querySelector(
            ".shell-sheet-panel",
          ) as HTMLElement | null;
          if (!panel) {
            return null;
          }
          const box = panel.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            viewportWidth: document.documentElement.clientWidth,
            scrollWidth: panel.scrollWidth,
            clientWidth: panel.clientWidth,
          };
        });
        expect(panelMetrics).not.toBeNull();
        expect(panelMetrics!.left).toBeGreaterThanOrEqual(-0.5);
        expect(panelMetrics!.right).toBeLessThanOrEqual(
          panelMetrics!.viewportWidth + 0.5,
        );
        expect(panelMetrics!.scrollWidth).toBeLessThanOrEqual(
          panelMetrics!.clientWidth + 1,
        );
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});
