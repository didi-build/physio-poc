import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";
import {
  formatRoutineDetailLoadFailedTimeoutMessage,
  type RoutineDetailLoadFailedProbeState,
} from "./routines-direct-entry-load-failed-diagnostics.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");
const ROUTINE_DETAIL_LOAD_FAILED_WAIT_MS = 30_000;
/** Matches CI upload `programs-didi-1014-layout-screenshots` (test-results/ is gitignored). */
const ROUTINE_DETAIL_LOAD_FAILED_ARTIFACT_DIR = join(
  process.cwd(),
  "test-results/programs-didi-1014-layout-screenshots",
);

type PageDiagnosticCapture = {
  consoleErrors: string[];
  pageErrors: string[];
};

function attachPageDiagnostics(page: Page): PageDiagnosticCapture {
  const capture: PageDiagnosticCapture = { consoleErrors: [], pageErrors: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      capture.consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => {
    capture.pageErrors.push(String(error));
  });
  return capture;
}

async function readRoutineDetailLoadFailedProbe(
  page: Page,
): Promise<RoutineDetailLoadFailedProbeState> {
  return page.evaluate(() => {
    const detail = document.querySelector(".rt-detail");
    return {
      routinesDetailCount: window.__harnessNavReadCounts?.["routines.detail"] ?? 0,
      busyPresent: Boolean(
        detail?.querySelector('[data-testid="exercise-library-busy-skeleton"]'),
      ),
      errorSlotPresent: Boolean(
        document.querySelector('[data-testid="exercise-library-detail-error-slot"]'),
      ),
      errorSlotInRtDetail: Boolean(
        detail?.querySelector('[data-testid="exercise-library-detail-error-slot"]'),
      ),
      layoutRootPresent: Boolean(document.querySelector("[data-layout-root]")),
      rtDetailPresent: detail !== null,
      href: location.href,
    };
  });
}

async function captureLoadFailedTimeoutArtifacts(
  page: Page,
  message: string,
  width: number,
): Promise<{ pngPath: string; txtPath: string }> {
  mkdirSync(ROUTINE_DETAIL_LOAD_FAILED_ARTIFACT_DIR, { recursive: true });
  const stamp = `w${width}-${Date.now()}`;
  const base = `routines-direct-entry-load-failed-${stamp}`;
  const pngPath = join(ROUTINE_DETAIL_LOAD_FAILED_ARTIFACT_DIR, `${base}.png`);
  const txtPath = join(ROUTINE_DETAIL_LOAD_FAILED_ARTIFACT_DIR, `${base}.txt`);
  await page.screenshot({ path: pngPath, fullPage: true });
  writeFileSync(txtPath, message, "utf8");
  return { pngPath, txtPath };
}

async function waitForHarnessFixture(page: Page, fixture: string): Promise<void> {
  await page.waitForSelector(`[data-layout-root="${fixture}"]`, {
    state: "attached",
    timeout: ROUTINE_DETAIL_LOAD_FAILED_WAIT_MS,
  });
}

async function waitForDetail(page: Page): Promise<void> {
  await page.waitForSelector(".rt-detail", { state: "visible", timeout: 30_000 });
}

async function waitForRoutineDetailLoadFailed(
  page: Page,
  fixture: string,
  diagnostics: PageDiagnosticCapture,
  width: number,
): Promise<void> {
  try {
    await page.waitForFunction(
      (fixtureId: string) => {
        const root = document.querySelector(`[data-layout-root="${fixtureId}"]`);
        if (!root) {
          return false;
        }
        const detail = document.querySelector(".rt-detail");
        if (!detail) {
          return false;
        }
        const count = window.__harnessNavReadCounts?.["routines.detail"] ?? 0;
        if (count < 1) {
          return false;
        }
        const error = detail.querySelector(
          '[data-testid="exercise-library-detail-error-slot"]',
        );
        if (!error) {
          return false;
        }
        const busy = detail.querySelector(
          '[data-testid="exercise-library-busy-skeleton"]',
        );
        return busy === null;
      },
      fixture,
      { timeout: ROUTINE_DETAIL_LOAD_FAILED_WAIT_MS },
    );
  } catch {
    const state = await readRoutineDetailLoadFailedProbe(page);
    const message = formatRoutineDetailLoadFailedTimeoutMessage(
      state,
      diagnostics.consoleErrors.slice(-5),
      diagnostics.pageErrors.slice(-5),
      ROUTINE_DETAIL_LOAD_FAILED_WAIT_MS,
    );
    const { pngPath, txtPath } = await captureLoadFailedTimeoutArtifacts(
      page,
      message,
      width,
    );
    throw new Error(
      `${message}\nFailure artifacts (gitignored): ${pngPath}\n${txtPath}`,
    );
  }
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
          const diagnostics = attachPageDiagnostics(page);
          await loadInterFontsInPage(page);
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}/?fixture=${fixture}`, {
            waitUntil: "domcontentloaded",
          });
          if (fixture === "routines-detail-load-failed") {
            await waitForRoutineDetailLoadFailed(page, fixture, diagnostics, width);
          } else {
            await waitForHarnessFixture(page, fixture);
            await ready!(page);
          }

          if (title) {
            const titleText = await page.locator(".ex-page-title").textContent();
            expect(titleText).toContain(title);
          }
          if (fixture === "routines-detail-update") {
            await page.waitForSelector('[data-testid="routine-community-changes"]', {
              timeout: 30_000,
            });
            const summary = page.locator(
              '[data-testid="routine-community-change-v2"] .rt-update-list-summary',
            );
            const summaryText = (await summary.textContent()) ?? "";
            expect(summaryText).toContain("Longer hold");
            expect(summaryText).toContain("Second line");
            const whiteSpace = await summary.evaluate(
              (el) => getComputedStyle(el).whiteSpace,
            );
            expect(whiteSpace).toBe("pre-wrap");
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
