import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { ensureLayoutHarnessBuilt } from "../test/helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../test/helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../test/helpers/static-file-server.js";

const OUT = "/opt/cursor/artifacts";
const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");

type Shot = {
  file: string;
  fixture: string;
  width: number;
  afterGoto?: (page: import("playwright").Page) => Promise<void>;
};

const shots: Shot[] = [
  { file: "routines-all-empty-390.png", fixture: "routines-all", width: 390 },
  { file: "routines-all-empty-1280.png", fixture: "routines-all", width: 1280 },
  {
    file: "routines-all-populated-390.png",
    fixture: "routines-all-populated",
    width: 390,
  },
  {
    file: "routines-all-populated-1280.png",
    fixture: "routines-all-populated",
    width: 1280,
  },
  {
    file: "routines-my-flag-390.png",
    fixture: "routines-my-flag",
    width: 390,
    afterGoto: async (page) => {
      await page.getByRole("tab", { name: "My routines" }).click();
      await page.waitForSelector("[data-testid='routines-flag-banner']");
    },
  },
  {
    file: "routines-detail-update-390.png",
    fixture: "routines-detail-update",
    width: 390,
  },
  {
    file: "routines-detail-update-1280.png",
    fixture: "routines-detail-update",
    width: 1280,
  },
];

await ensureLayoutHarnessBuilt();
await mkdir(OUT, { recursive: true });
const server = await startStaticFileServer(HARNESS_DIST);
const browser = await chromium.launch();
try {
  for (const shot of shots) {
    const page = await browser.newPage();
    await loadInterFontsInPage(page);
    await page.setViewportSize({ width: shot.width, height: 900 });
    await page.goto(`${server.baseUrl}/?fixture=${shot.fixture}`, {
      waitUntil: "load",
    });
    await page.waitForSelector("[data-layout-root]", { timeout: 30_000 });
    if (shot.afterGoto) {
      await shot.afterGoto(page);
    } else {
      await page.waitForSelector(".rt-library-page, .rt-detail", {
        timeout: 30_000,
      });
    }
    await page.screenshot({
      path: join(OUT, shot.file),
      fullPage: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(
  join(OUT, "routines-evidence-index.txt"),
  shots.map((s) => s.file).join("\n") + "\n",
);
