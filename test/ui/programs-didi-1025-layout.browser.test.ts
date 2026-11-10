import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FILTER_FROM_ROUTINE,
  FILTER_FROM_SCRATCH,
  NEW_PROGRAM_FROM_ROUTINE,
  NEW_PROGRAM_ROUTINE_PICKER_TITLE,
  NEW_PROGRAM_SHEET_TITLE,
  builderOriginBannerTitle,
} from "../../src/ui/copy/programs.js";
import {
  PUBLISH_NAME_ROUTINE_HINT,
  PUBLISH_SHEET_TITLE,
} from "../../src/ui/copy/program-publish.js";
import {
  CREATE_PROGRAM_FROM_ROUTINE,
  USE_FOR_PATIENT,
} from "../../src/ui/copy/routines.js";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";
import { ROUTINE_1025_ORIGIN } from "./harness/programs-didi-1025-fixtures.js";
import type { HarnessFixtureId } from "./harness/fixtures.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");
const ARTIFACTS_DIR = process.env.CI
  ? join(process.cwd(), "test-results/programs-didi-1025-layout-screenshots")
  : "/opt/cursor/artifacts";

/** In-repo mockup paths under design/app (compare captures visually in PR artifacts). */
const MOCKUP_REF = {
  routines05: "design/app/routines/mockups/05-routine-detail-community-phone.png",
  routines06: "design/app/routines/mockups/06-routine-detail-my-copy-edited-phone.png",
  programs05: "design/app/programs/mockups/05-new-program-chooser-phone.png",
  programs06: "design/app/programs/mockups/06-pick-a-routine-for-new-program-phone.png",
  programs07: "design/app/programs/mockups/07-builder-from-routine-phone.png",
  programs08: "design/app/programs/mockups/08-first-publish-from-routine-phone.png",
  programs21:
    "design/app/programs/mockups/21-use-for-patient-lands-on-publish-sheet-phone.png",
  programs01: "design/app/programs/mockups/01-programs-list-phone.png",
} as const;

type LayoutCapture = {
  mockupRef: string;
  fixture: HarnessFixtureId;
  fileStem: string;
  widths: readonly (390 | 1280)[];
  screenshot?: "viewport" | "sheet-panel";
  ready?: (page: Page) => Promise<void>;
};

const CAPTURES: LayoutCapture[] = [
  {
    mockupRef: MOCKUP_REF.routines05,
    fixture: "routines-1025-detail-actions",
    fileStem: "didi-1025-routines-05-detail-actions",
    widths: [390, 1280],
    ready: async (page) => {
      await page.getByRole("button", { name: USE_FOR_PATIENT }).first().waitFor({
        state: "visible",
      });
      await page
        .getByRole("button", { name: CREATE_PROGRAM_FROM_ROUTINE })
        .waitFor({ state: "visible" });
    },
  },
  {
    mockupRef: MOCKUP_REF.programs05,
    fixture: "programs-1025-new-chooser",
    fileStem: "didi-1025-programs-05-new-program-chooser",
    widths: [390, 1280],
    ready: async (page) => {
      await page.getByRole("dialog", { name: NEW_PROGRAM_SHEET_TITLE }).waitFor({
        state: "visible",
      });
      await page.getByRole("button", { name: NEW_PROGRAM_FROM_ROUTINE }).waitFor({
        state: "visible",
      });
    },
  },
  {
    mockupRef: MOCKUP_REF.programs06,
    fixture: "programs-1025-pick-routine",
    fileStem: "didi-1025-programs-06-pick-routine",
    widths: [390, 1280],
    ready: async (page) => {
      await page
        .getByRole("dialog", { name: NEW_PROGRAM_ROUTINE_PICKER_TITLE })
        .waitFor({
          state: "visible",
        });
      await page
        .getByText("Knee osteoarthritis, starter")
        .waitFor({ state: "visible" });
    },
  },
  {
    mockupRef: MOCKUP_REF.programs07,
    fixture: "programs-1025-builder-from-routine",
    fileStem: "didi-1025-programs-07-builder-from-routine",
    widths: [390, 1280],
    ready: async (page) => {
      await page
        .getByText(
          builderOriginBannerTitle(
            ROUTINE_1025_ORIGIN.routine_name,
            ROUTINE_1025_ORIGIN.routine_version_number,
          ),
        )
        .waitFor({ state: "visible" });
      await page
        .getByRole("link", { name: "View routine" })
        .waitFor({ state: "visible" });
    },
  },
  {
    mockupRef: MOCKUP_REF.programs08,
    fixture: "programs-1025-publish-from-routine",
    fileStem: "didi-1025-programs-08-publish-from-routine",
    widths: [390, 1280],
    ready: async (page) => {
      const dialog = page.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
      await dialog.waitFor({ state: "visible" });
      const nameInput = dialog.locator("#pg-publish-name-input");
      await nameInput.waitFor({ state: "visible" });
      expect(await nameInput.inputValue()).toBe(ROUTINE_1025_ORIGIN.routine_name);
      await dialog.getByText(PUBLISH_NAME_ROUTINE_HINT).waitFor({ state: "visible" });
    },
  },
  {
    mockupRef: MOCKUP_REF.programs21,
    fixture: "programs-1025-publish-from-routine",
    fileStem: "didi-1025-programs-21-use-for-patient-publish",
    widths: [390, 1280],
    ready: async (page) => {
      const dialog = page.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
      await dialog.waitFor({ state: "visible" });
      await dialog.getByRole("heading", { name: "First publish" }).waitFor({
        state: "visible",
      });
    },
  },
  {
    mockupRef: MOCKUP_REF.programs01,
    fixture: "programs-1025-list-filters",
    fileStem: "didi-1025-programs-list-origin-filters",
    widths: [390, 1280],
    ready: async (page) => {
      await page
        .getByRole("group", { name: /Show programs/i })
        .waitFor({ state: "visible" });
      await page.getByRole("button", { name: FILTER_FROM_ROUTINE }).waitFor({
        state: "visible",
      });
      await page.getByRole("button", { name: FILTER_FROM_SCRATCH }).waitFor({
        state: "visible",
      });
    },
  },
];

async function captureFixture(
  browser: Browser,
  baseUrl: string,
  capture: LayoutCapture,
  width: 390 | 1280,
): Promise<void> {
  const page = await browser.newPage();
  try {
    await loadInterFontsInPage(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/?fixture=${capture.fixture}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(`[data-layout-root="${capture.fixture}"]`, {
      timeout: 60_000,
    });
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

describe("Program from routine layout (DIDI-1025 mockups)", () => {
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

  it("captures from-routine program flows at 390 and 1280 px", async () => {
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
