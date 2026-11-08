import { join } from "node:path";
import { chromium, type Page, type Route } from "playwright";
import { beforeAll, describe, expect, it } from "vitest";
import {
  routineDetailsPath,
  routineMyCopyPath,
} from "../../src/routine-library-api-paths.js";
import { PRACTITIONER_SESSION_API_PATH } from "../../src/practitioner-session-api-paths.js";
import { ensureLayoutHarnessBuilt } from "../helpers/ensure-layout-harness-built.js";
import { loadInterFontsInPage } from "../helpers/load-inter-fonts-in-page.js";
import { startStaticFileServer } from "../helpers/static-file-server.js";
import {
  openRoutinesHttpBrowserWorld,
  ownerPersonalHold,
  type RoutinesHttpBrowserWorld,
} from "../helpers/routines-http-browser-world.js";
import { mutatingAppApiRequestInit } from "../helpers/mutating-app-api-request.js";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");

function isRoutinesMeApiUrl(url: string): boolean {
  const pathname = new URL(url).pathname;
  return (
    pathname.startsWith("/api/me/routines") ||
    pathname.startsWith("/api/me/my-routines") ||
    pathname === "/api/me/session"
  );
}

async function fulfillFromWorld(
  route: Route,
  world: RoutinesHttpBrowserWorld,
): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname + url.search;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers())) {
    headers[key] = value;
  }
  const init: RequestInit = { method: request.method(), headers };
  const postData = request.postData();
  if (postData) {
    init.body = postData;
  }
  const upstreamUrl = `https://physio.browser.test${path}`;
  const response = await world.dispatchBrowserRequest(
    path,
    mutatingAppApiRequestInit(upstreamUrl, init),
  );
  const body = await response.text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  await route.fulfill({
    status: response.status,
    headers: responseHeaders,
    body,
  });
}

async function gotoRoutinesHttpPage(
  page: Page,
  world: RoutinesHttpBrowserWorld,
  base: string,
  entry: "detail" | "my-copy",
): Promise<void> {
  const routinePath =
    entry === "my-copy"
      ? `/routines/${world.routineId}/my-copy`
      : `/routines/${world.routineId}`;
  const query = new URLSearchParams({
    routineId: world.routineId,
    entry: routinePath,
  });
  await page.goto(`${base}/routines-http.html?${query.toString()}`, {
    waitUntil: "load",
  });
}

beforeAll(() => {
  ensureLayoutHarnessBuilt();
});

describe("Routines auth HTTP browser (390/1280, DIDI-1022 post-cap)", () => {
  it.each([390, 1280] as const)(
    "signed-out direct detail shows load error slot over real 401 at %s px",
    async (width) => {
      const world = await openRoutinesHttpBrowserWorld();
      const server = await startStaticFileServer(HARNESS_DIST);
      const browser = await chromium.launch();
      try {
        world.setActiveSession("none");
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.route("**/*", async (route) => {
          if (isRoutinesMeApiUrl(route.request().url())) {
            await fulfillFromWorld(route, world);
            return;
          }
          await route.continue();
        });
        await gotoRoutinesHttpPage(page, world, server.baseUrl, "detail");
        await page.waitForSelector(".rt-detail", {
          state: "attached",
          timeout: 30_000,
        });
        await page.waitForSelector(
          '[data-testid="exercise-library-detail-error-slot"]',
          {
            state: "attached",
            timeout: 30_000,
          },
        );
        const detail401 = await world.dispatchBrowserRequest(
          routineDetailsPath(world.routineId),
        );
        expect(detail401.status).toBe(401);
      } finally {
        await browser.close();
        world.close();
        await server.close();
      }
    },
    60_000,
  );

  it.each([390, 1280] as const)(
    "signed-out direct my-copy shows load error slot over real 401 at %s px",
    async (width) => {
      const world = await openRoutinesHttpBrowserWorld();
      const server = await startStaticFileServer(HARNESS_DIST);
      const browser = await chromium.launch();
      try {
        world.setActiveSession("none");
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.route("**/*", async (route) => {
          if (isRoutinesMeApiUrl(route.request().url())) {
            await fulfillFromWorld(route, world);
            return;
          }
          await route.continue();
        });
        await gotoRoutinesHttpPage(page, world, server.baseUrl, "my-copy");
        await page.waitForSelector(
          '[data-testid="exercise-library-detail-error-slot"]',
          {
            state: "attached",
            timeout: 30_000,
          },
        );
        const detail401 = await world.dispatchBrowserRequest(
          routineDetailsPath(world.routineId),
        );
        expect(detail401.status).toBe(401);
      } finally {
        await browser.close();
        world.close();
        await server.close();
      }
    },
    60_000,
  );

  it.each([390, 1280] as const)(
    "owner loads my-copy editor with seeded hold over HTTP at %s px",
    async (width) => {
      const world = await openRoutinesHttpBrowserWorld();
      const server = await startStaticFileServer(HARNESS_DIST);
      const browser = await chromium.launch();
      try {
        world.setActiveSession("owner");
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.route("**/*", async (route) => {
          if (isRoutinesMeApiUrl(route.request().url())) {
            await fulfillFromWorld(route, world);
            return;
          }
          await route.continue();
        });
        await gotoRoutinesHttpPage(page, world, server.baseUrl, "my-copy");
        await page.waitForSelector('[data-testid="save-my-copy"]', {
          state: "visible",
          timeout: 30_000,
        });
        const hold = await page.inputValue('[data-testid="rt-hold-0"]');
        expect(hold).toBe("45");
      } finally {
        await browser.close();
        world.close();
        await server.close();
      }
    },
    60_000,
  );

  it.each([390, 1280] as const)(
    "owner loads detail and session over HTTP at %s px",
    async (width) => {
      const world = await openRoutinesHttpBrowserWorld();
      const server = await startStaticFileServer(HARNESS_DIST);
      const browser = await chromium.launch();
      try {
        world.setActiveSession("owner");
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.route("**/*", async (route) => {
          if (isRoutinesMeApiUrl(route.request().url())) {
            await fulfillFromWorld(route, world);
            return;
          }
          await route.continue();
        });
        await gotoRoutinesHttpPage(page, world, server.baseUrl, "detail");
        await page.waitForSelector(".rt-detail", { state: "visible", timeout: 30_000 });
        const title = await page.locator(".ex-page-title").textContent();
        expect(title).toContain(world.routineName);
        const session = await world.dispatchBrowserRequest(
          PRACTITIONER_SESSION_API_PATH,
        );
        expect(session.status).toBe(200);
        const body = (await session.json()) as { practitioner_id: string };
        expect(body.practitioner_id).toBe(world.ownerId);
      } finally {
        await browser.close();
        world.close();
        await server.close();
      }
    },
    60_000,
  );

  it.each([390, 1280] as const)(
    "second practitioner sees community detail without owner's personal copy at %s px",
    async (width) => {
      const world = await openRoutinesHttpBrowserWorld();
      const server = await startStaticFileServer(HARNESS_DIST);
      const browser = await chromium.launch();
      try {
        world.setActiveSession("other");
        const holdBefore = await ownerPersonalHold(
          world.storage,
          world.ownerId,
          world.routineId,
        );
        expect(holdBefore).toBe(45);
        const page = await browser.newPage();
        await loadInterFontsInPage(page);
        await page.setViewportSize({ width, height: 900 });
        await page.route("**/*", async (route) => {
          if (isRoutinesMeApiUrl(route.request().url())) {
            await fulfillFromWorld(route, world);
            return;
          }
          await route.continue();
        });
        await gotoRoutinesHttpPage(page, world, server.baseUrl, "detail");
        await page.waitForSelector(".rt-detail", { state: "visible", timeout: 30_000 });
        const title = await page.locator(".ex-page-title").textContent();
        expect(title).toContain(world.routineName);
        expect(
          await page.getByRole("button", { name: "Remove from My routines" }).count(),
        ).toBe(0);
        const otherDetail = await world.dispatchBrowserRequest(
          routineDetailsPath(world.routineId),
        );
        const payload = (await otherDetail.json()) as {
          my_copy: unknown;
          personal_changes: unknown;
          community_change_list: unknown;
        };
        expect(payload.my_copy).toBeNull();
        expect(payload.personal_changes).toBeNull();
        expect(payload.community_change_list).toBeNull();
        const ownerHold = await ownerPersonalHold(
          world.storage,
          world.ownerId,
          world.routineId,
        );
        expect(ownerHold).toBe(45);
      } finally {
        await browser.close();
        world.close();
        await server.close();
      }
    },
    60_000,
  );

  it("second practitioner cannot remove owner's copy over HTTP", async () => {
    const world = await openRoutinesHttpBrowserWorld();
    try {
      world.setActiveSession("other");
      const remove = await world.dispatchBrowserRequest(
        routineMyCopyPath(world.routineId),
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
        },
      );
      expect(remove.status).toBe(404);
      const holdAfter = await ownerPersonalHold(
        world.storage,
        world.ownerId,
        world.routineId,
      );
      expect(holdAfter).toBe(45);
    } finally {
      world.close();
    }
  });

  it("second practitioner cannot replay owner's undo over HTTP", async () => {
    const world = await openRoutinesHttpBrowserWorld();
    try {
      world.setActiveSession("owner");
      const remove = await world.dispatchBrowserRequest(
        routineMyCopyPath(world.routineId),
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
        },
      );
      const { undo } = (await remove.json()) as { undo: unknown };
      const holdBefore = await ownerPersonalHold(
        world.storage,
        world.ownerId,
        world.routineId,
      );
      world.setActiveSession("other");
      const replay = await world.dispatchBrowserRequest(
        routineMyCopyPath(world.routineId),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "undo", undo }),
        },
      );
      expect(replay.status).toBe(400);
      await expect(replay.json()).resolves.toMatchObject({ error: "undo_mismatch" });
      world.setActiveSession("owner");
      const holdAfter = await ownerPersonalHold(
        world.storage,
        world.ownerId,
        world.routineId,
      );
      expect(holdAfter).toBe(holdBefore);
    } finally {
      world.close();
    }
  });
});
