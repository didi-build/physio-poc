/**
 * Real Chromium proof for DIDI-1188 app-wide session cache (390 / 1280 px).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";
import { ACCOUNT_MY_DEFAULTS } from "../../src/ui/copy/nav.js";
import { MY_DEFAULTS_PAGE_TITLE } from "../../src/ui/copy/my-defaults.js";
import { REQUESTS_HEADING } from "../../src/ui/copy/exercise-requests.js";
import { LIB_HEADING } from "../../src/ui/copy/exercise-library.js";
import { PROGRAMS_PAGE_TITLE } from "../../src/ui/copy/programs.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");
const FIXTURE = "app-wide-cache-nav";

type ResourceKey =
  | "exercises.my_list"
  | "exercise_requests.in_progress_list"
  | "exercise_requests.in_progress_count"
  | "my_defaults.page"
  | "programs.list"
  | "programs.list_deleted";

const NAV_RESOURCES: ResourceKey[] = [
  "exercises.my_list",
  "exercise_requests.in_progress_count",
  "exercise_requests.in_progress_list",
  "my_defaults.page",
  "programs.list",
  "programs.list_deleted",
];

async function readHarnessCount(page: Page, key: ResourceKey): Promise<number> {
  return page.evaluate(
    (resource) => window.__harnessNavReadCounts?.[resource] ?? 0,
    key,
  );
}

async function readHarnessCounts(page: Page): Promise<Record<ResourceKey, number>> {
  const out = {} as Record<ResourceKey, number>;
  for (const key of NAV_RESOURCES) {
    out[key] = await readHarnessCount(page, key);
  }
  return out;
}

async function assertNoBusySkeletonWhile(page: Page, ms: number): Promise<void> {
  const selector =
    '[data-testid="exercise-library-busy-skeleton"], .pg-busy, .rt-busy, [aria-busy="true"]';
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const busy = await page.locator(selector).count();
    expect(busy).toBe(0);
    await page.waitForTimeout(50);
  }
}

async function openAccountMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu" }).click();
}

async function navigateRequestsViaAccount(page: Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByTestId("shell-menu-requests").click();
  await page.getByRole("heading", { name: REQUESTS_HEADING }).waitFor({
    state: "visible",
    timeout: 60_000,
  });
}

async function navigateMyDefaultsViaAccount(page: Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: ACCOUNT_MY_DEFAULTS }).click();
  await page.getByRole("heading", { name: MY_DEFAULTS_PAGE_TITLE }).waitFor({
    state: "visible",
    timeout: 60_000,
  });
}

async function navigateProgramsViaMain(page: Page): Promise<void> {
  const link = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: PROGRAMS_PAGE_TITLE });
  await link.click();
  await page
    .locator("#programs-heading")
    .waitFor({ state: "visible", timeout: 60_000 });
}

async function runNavMatrix(browser: Browser, baseUrl: string, width: 390 | 1280) {
  const page = await browser.newPage();
  try {
    await loadInterFontsInPage(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/?fixture=${FIXTURE}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: LIB_HEADING }).waitFor({
      state: "visible",
      timeout: 60_000,
    });

    const afterExercises = await readHarnessCounts(page);
    expect(afterExercises["exercises.my_list"]).toBe(1);
    expect(afterExercises["exercise_requests.in_progress_count"]).toBe(1);

    await navigateRequestsViaAccount(page);
    let counts = await readHarnessCounts(page);
    expect(counts["exercise_requests.in_progress_list"]).toBe(1);
    expect(counts["exercise_requests.in_progress_count"]).toBe(1);

    await navigateMyDefaultsViaAccount(page);
    counts = await readHarnessCounts(page);
    expect(counts["my_defaults.page"]).toBe(1);

    await navigateProgramsViaMain(page);
    const expectedAfterFirstPass = await readHarnessCounts(page);
    expect(expectedAfterFirstPass["programs.list"]).toBe(1);
    expect(expectedAfterFirstPass["programs.list_deleted"]).toBe(1);

    await navigateRequestsViaAccount(page);
    await assertNoBusySkeletonWhile(page, 500);
    const afterRequestsRevisit = await readHarnessCounts(page);
    expect(afterRequestsRevisit["exercise_requests.in_progress_list"]).toBe(1);

    await navigateMyDefaultsViaAccount(page);
    await assertNoBusySkeletonWhile(page, 500);
    const afterDefaultsRevisit = await readHarnessCounts(page);
    for (const key of NAV_RESOURCES) {
      expect(afterDefaultsRevisit[key]).toBe(expectedAfterFirstPass[key]);
    }
  } finally {
    await page.close();
  }
}

describe("App-wide session read cache browser proof (DIDI-1188)", () => {
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

  it.each([390, 1280] as const)(
    "nav matrix Exercises → Requests → My defaults → Programs → revisit at %i px uses exactly one harness GET per resource",
    async (width) => {
      const browser = await chromium.launch();
      try {
        await runNavMatrix(browser, baseUrl, width);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it.each([390, 1280] as const)(
    "cold load at %i px makes exactly one in-progress count harness GET",
    async (width) => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      try {
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${baseUrl}/?fixture=${FIXTURE}`, {
          waitUntil: "domcontentloaded",
        });
        await page.getByRole("heading", { name: LIB_HEADING }).waitFor({
          state: "visible",
          timeout: 60_000,
        });
        expect(
          await readHarnessCount(page, "exercise_requests.in_progress_count"),
        ).toBe(1);
      } finally {
        await page.close();
        await browser.close();
      }
    },
    60_000,
  );

  it.each([390, 1280] as const)(
    "coalesced window focus at %i px refetches requests list and count once only",
    async (width) => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      try {
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${baseUrl}/?fixture=${FIXTURE}`, {
          waitUntil: "domcontentloaded",
        });
        await navigateRequestsViaAccount(page);
        await assertNoBusySkeletonWhile(page, 400);

        const beforeList = await readHarnessCount(
          page,
          "exercise_requests.in_progress_list",
        );
        const beforeCount = await readHarnessCount(
          page,
          "exercise_requests.in_progress_count",
        );
        const beforeExercises = await readHarnessCount(page, "exercises.my_list");

        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
          });
          window.dispatchEvent(new Event("focus"));
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new Event("focus"));
          window.dispatchEvent(new Event("focus"));
        });
        await page.waitForTimeout(200);

        expect(await readHarnessCount(page, "exercise_requests.in_progress_list")).toBe(
          beforeList + 1,
        );
        expect(
          await readHarnessCount(page, "exercise_requests.in_progress_count"),
        ).toBe(beforeCount + 1);
        expect(await readHarnessCount(page, "exercises.my_list")).toBe(beforeExercises);
        expect(await readHarnessCount(page, "my_defaults.page")).toBe(0);
        expect(await readHarnessCount(page, "programs.list")).toBe(0);
      } finally {
        await page.close();
        await browser.close();
      }
    },
    90_000,
  );
});
