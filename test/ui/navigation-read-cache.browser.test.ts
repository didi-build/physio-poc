/**
 * Real Chromium navigation proof for DIDI-1185 (390 / 1280 px).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");

type NavCase = {
  fixture: string;
  firstHeading: string;
  revisitHeading: string;
  countKey: string;
};

const CASES: NavCase[] = [
  {
    fixture: "exercises-mine",
    firstHeading: "Exercise library",
    revisitHeading: "Exercise library",
    countKey: "exercises.my_list",
  },
  {
    fixture: "routines-all-populated",
    firstHeading: "Routines",
    revisitHeading: "Routines",
    countKey: "routines.community_search",
  },
  {
    fixture: "programs-populated",
    firstHeading: "Programs",
    revisitHeading: "Programs",
    countKey: "programs.list",
  },
];

async function readHarnessCount(page: Page, key: string): Promise<number> {
  return page.evaluate(
    (resource) => window.__harnessNavReadCounts?.[resource] ?? 0,
    key,
  );
}

async function assertNoBusySkeletonWhile(
  page: Page,
  selector: string,
  ms: number,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const busy = await page.locator(selector).count();
    expect(busy).toBe(0);
    await page.waitForTimeout(50);
  }
}

async function visitFixture(
  browser: Browser,
  baseUrl: string,
  width: 390 | 1280,
  navCase: NavCase,
): Promise<void> {
  const page = await browser.newPage();
  try {
    await loadInterFontsInPage(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/?fixture=${navCase.fixture}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: navCase.firstHeading }).waitFor({
      state: "visible",
      timeout: 60_000,
    });
    const afterFirst = await readHarnessCount(page, navCase.countKey);
    expect(afterFirst).toBeGreaterThanOrEqual(1);

    const mainNav = page.getByRole("navigation", { name: "Main" });
    if (navCase.fixture === "exercises-mine") {
      await mainNav.getByRole("link", { name: "Programs" }).click();
      await page.locator("#programs-heading").waitFor({ state: "visible" });
      await mainNav.getByRole("link", { name: "Exercises" }).click();
    } else if (navCase.fixture === "routines-all-populated") {
      await mainNav.getByRole("link", { name: "Exercises" }).click();
      await page.getByRole("heading", { name: "Exercise library" }).waitFor({
        state: "visible",
      });
      await mainNav.getByRole("link", { name: "Routines" }).click();
    } else {
      await mainNav.getByRole("link", { name: "Routines" }).click();
      await page
        .getByRole("heading", { name: "Routines" })
        .waitFor({ state: "visible" });
      await mainNav.getByRole("link", { name: "Programs" }).click();
    }

    const revisitLocator =
      navCase.fixture === "programs-populated"
        ? page.locator("#programs-heading")
        : page.getByRole("heading", { name: navCase.revisitHeading });
    await revisitLocator.waitFor({
      state: "visible",
      timeout: 60_000,
    });
    await assertNoBusySkeletonWhile(
      page,
      '[data-testid="exercise-library-busy-skeleton"], .pg-busy, .rt-busy',
      400,
    );
    const afterRevisit = await readHarnessCount(page, navCase.countKey);
    expect(afterRevisit).toBe(afterFirst);
  } finally {
    await page.close();
  }
}

describe("Navigation session read cache browser proof (DIDI-1185)", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(() => {
    ensureLayoutHarnessBuilt();
    mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
  });

  beforeAll(async () => {
    const server = await startStaticFileServer(HARNESS_DIST);
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  afterAll(async () => {
    await closeServer?.();
  });

  it.each(
    CASES.flatMap((navCase) =>
      ([390, 1280] as const).map((width) => ({ navCase, width })),
    ),
  )(
    "$navCase.fixture revisit at $width px keeps content without extra harness GET counts",
    async ({ navCase, width }) => {
      const browser = await chromium.launch();
      try {
        await visitFixture(browser, baseUrl, width, navCase);
      } finally {
        await browser.close();
      }
    },
    90_000,
  );
});
