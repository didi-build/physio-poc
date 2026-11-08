import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");

const TITLE_TO_TABS_EXPECTED_PX = 12;

type LibraryRhythmMetrics = {
  titleLeft: number;
  tabsLeft: number;
  introLeft: number;
  searchLeft: number | null;
  filtersLeft: number | null;
  titleToTabsGap: number;
};

async function waitForLibraryScreen(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { state: "visible", timeout: 30_000 });
}

async function readLibraryRhythm(
  page: Page,
  sectionSelector: string,
): Promise<LibraryRhythmMetrics | null> {
  return page.evaluate((selector) => {
    const section = document.querySelector(selector);
    if (!section) {
      return null;
    }
    const title = section.querySelector(".ex-page-title") as HTMLElement | null;
    const tabs = section.querySelector(".ex-tabs") as HTMLElement | null;
    const intro = section.querySelector(".ex-page-intro") as HTMLElement | null;
    const searchInner = section.querySelector(".ex-search-wrap") as HTMLElement | null;
    const filters = section.querySelector(".ex-filters-wrap") as HTMLElement | null;
    if (!title || !tabs || !intro) {
      return null;
    }
    const readLeft = (el: HTMLElement | null) => el?.getBoundingClientRect().left ?? 0;
    const titleBox = title.getBoundingClientRect();
    const tabsBox = tabs.getBoundingClientRect();
    return {
      titleLeft: readLeft(title),
      tabsLeft: readLeft(tabs),
      introLeft: readLeft(intro),
      searchLeft: searchInner ? readLeft(searchInner) : null,
      filtersLeft: filters ? readLeft(filters) : null,
      titleToTabsGap: tabsBox.top - titleBox.bottom,
    };
  }, sectionSelector);
}

async function readMainContentLeft(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const main = document.querySelector(".shell-main") as HTMLElement | null;
    if (!main) {
      return null;
    }
    const style = getComputedStyle(main);
    const box = main.getBoundingClientRect();
    const padLeft = Number.parseFloat(style.paddingLeft);
    return box.left + padLeft;
  });
}

async function readMainBorderLeft(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const main = document.querySelector(".shell-main") as HTMLElement | null;
    return main?.getBoundingClientRect().left ?? null;
  });
}

async function readLibrarySearchPhoneLayout(
  page: Page,
  sectionSelector: string,
): Promise<{
  stickyLeft: number;
  searchWrapLeft: number;
  stickyMarginTop: string;
} | null> {
  return page.evaluate((selector) => {
    const section = document.querySelector(selector) as HTMLElement | null;
    const sticky = section?.querySelector(".ex-search-sticky") as HTMLElement | null;
    const wrap = section?.querySelector(".ex-search-wrap") as HTMLElement | null;
    if (!sticky || !wrap) {
      return null;
    }
    return {
      stickyLeft: sticky.getBoundingClientRect().left,
      searchWrapLeft: wrap.getBoundingClientRect().left,
      stickyMarginTop: getComputedStyle(sticky).marginTop,
    };
  }, sectionSelector);
}

async function readIntroMinHeight(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const intro = document.querySelector(
      'section[aria-labelledby="ex-lib-heading"] .ex-page-intro',
    ) as HTMLElement | null;
    return intro ? getComputedStyle(intro).minHeight : null;
  });
}

describe("Library page shared spacing (DIDI-1180)", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(() => {
    ensureLayoutHarnessBuilt();
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
    {
      fixture: "exercises-mine",
      readySelector: "#ex-lib-heading",
      sectionSelector: 'section[aria-labelledby="ex-lib-heading"]',
      hasSearch: true,
      phoneSearchMarginTop: "0px",
    },
    {
      fixture: "routines-all",
      readySelector: '[data-testid="routines-page"]',
      sectionSelector: '[data-testid="routines-page"]',
      hasSearch: true,
      phoneSearchMarginTop: "8px",
    },
  ] as const)(
    "keeps $fixture title/tabs/helper on the shared gutter at 390 and 1280 px",
    async ({
      fixture,
      readySelector,
      sectionSelector,
      hasSearch,
      phoneSearchMarginTop,
    }) => {
      for (const width of [390, 1280]) {
        const browser = await chromium.launch();
        try {
          const page = await browser.newPage();
          await loadInterFontsInPage(page);
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}/?fixture=${fixture}`, { waitUntil: "load" });
          await waitForLibraryScreen(page, readySelector);

          const mainLeft = await readMainContentLeft(page);
          const rhythm = await readLibraryRhythm(page, sectionSelector);
          expect(mainLeft).not.toBeNull();
          expect(rhythm).not.toBeNull();

          const gutterLeft = mainLeft!;
          const { titleLeft, tabsLeft, introLeft, searchLeft, filtersLeft } = rhythm!;
          expect(titleLeft).toBeCloseTo(gutterLeft, 0);
          expect(tabsLeft).toBeCloseTo(gutterLeft, 0);
          expect(introLeft).toBeCloseTo(gutterLeft, 0);
          if (hasSearch) {
            expect(searchLeft).not.toBeNull();
            expect(filtersLeft).not.toBeNull();
            expect(filtersLeft!).toBeCloseTo(gutterLeft, 0);
            if (width === 390) {
              const mainBorderLeft = await readMainBorderLeft(page);
              const phoneSearch = await readLibrarySearchPhoneLayout(
                page,
                sectionSelector,
              );
              expect(mainBorderLeft).not.toBeNull();
              expect(phoneSearch).not.toBeNull();
              expect(phoneSearch!.stickyLeft).toBeCloseTo(mainBorderLeft!, 0);
              expect(phoneSearch!.searchWrapLeft).toBeCloseTo(gutterLeft, 0);
              expect(phoneSearch!.stickyMarginTop).toBe(phoneSearchMarginTop);
            } else if (width >= 1024) {
              expect(Math.abs(searchLeft! - (gutterLeft + 20))).toBeLessThanOrEqual(2);
            }
          }

          expect(rhythm!.titleToTabsGap).toBeCloseTo(TITLE_TO_TABS_EXPECTED_PX, 0);
        } finally {
          await browser.close();
        }
      }
    },
    120_000,
  );

  it.each([390, 1280])(
    "matches Exercises and Routines title-to-tabs gap at %i px",
    async (width) => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });

        await page.goto(`${baseUrl}/?fixture=exercises-mine`, { waitUntil: "load" });
        await waitForLibraryScreen(page, "#ex-lib-heading");
        const exRhythm = await readLibraryRhythm(
          page,
          'section[aria-labelledby="ex-lib-heading"]',
        );

        await page.goto(`${baseUrl}/?fixture=routines-all`, { waitUntil: "load" });
        await waitForLibraryScreen(page, '[data-testid="routines-page"]');
        const rtRhythm = await readLibraryRhythm(page, '[data-testid="routines-page"]');

        expect(exRhythm).not.toBeNull();
        expect(rtRhythm).not.toBeNull();
        expect(exRhythm!.titleToTabsGap).toBeCloseTo(rtRhythm!.titleToTabsGap, 0);
        expect(exRhythm!.titleToTabsGap).toBeCloseTo(TITLE_TO_TABS_EXPECTED_PX, 0);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it.each([
    { width: 390, expectedMinHeight: "60px" },
    { width: 640, expectedMinHeight: "40px" },
    { width: 1280, expectedMinHeight: "0px" },
  ] as const)(
    "pins helper min-height at %i px on Exercises",
    async ({ width, expectedMinHeight }) => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${baseUrl}/?fixture=exercises-mine`, { waitUntil: "load" });
        await waitForLibraryScreen(page, "#ex-lib-heading");
        const minHeight = await readIntroMinHeight(page);
        expect(minHeight).toBe(expectedMinHeight);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it.each([
    { fixture: "exercises-mine", readySelector: "#ex-lib-heading" },
    { fixture: "routines-all", readySelector: '[data-testid="routines-page"]' },
  ] as const)(
    "avoids horizontal overflow for $fixture at 390 and 1280 px",
    async ({ fixture, readySelector }) => {
      for (const width of [390, 1280]) {
        const browser = await chromium.launch();
        try {
          const page = await browser.newPage();
          await loadInterFontsInPage(page);
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}/?fixture=${fixture}`, { waitUntil: "load" });
          await waitForLibraryScreen(page, readySelector);

          const overflow = await page.evaluate(() => {
            const frame = document.querySelector(".shell-frame") as HTMLElement | null;
            if (!frame) {
              return null;
            }
            return {
              clientWidth: frame.clientWidth,
              scrollWidth: frame.scrollWidth,
            };
          });
          expect(overflow).not.toBeNull();
          expect(overflow!.scrollWidth).toBeLessThanOrEqual(overflow!.clientWidth + 1);
        } finally {
          await browser.close();
        }
      }
    },
    120_000,
  );
});
