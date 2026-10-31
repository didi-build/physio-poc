import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { describe, expect, it } from "vitest";
import {
  CHATGPT_CIMD_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  CookieJar,
  createChatGptCimdDocument,
  createMcpOAuthTestDeps,
  followAuthorizeToConsent,
  buildAuthorizeUrl,
  completeGoogleSignIn,
  mcpResourceUrl,
  randomPkceVerifier,
} from "./helpers/mcp-oauth-test-utils.js";
import { sanitizeOAuthClientDisplayName } from "../src/auth/mcp-oauth/sanitize-client-name.js";

const LONG_CLIENT_NAME_RAW =
  "ChatGPT Connector for Clinics and Practitioners Extended Edition 2026 Beta Build";
const LONG_CLIENT_NAME_DISPLAY = sanitizeOAuthClientDisplayName(
  LONG_CLIENT_NAME_RAW,
  "chatgpt.com",
);
const LONG_NO_SPACE_NAME =
  "ChatGPTConnectorForClinicsAndPractitionersExtendedEdition2026BetaBuild";

const FONT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../node_modules/@fontsource/inter/files",
);

function interWoff2Base64(weight: 400 | 600 | 700): string {
  const file = join(FONT_DIR, `inter-latin-${weight}-normal.woff2`);
  return readFileSync(file).toString("base64");
}

const INTER_400_B64 = interWoff2Base64(400);
const INTER_600_B64 = interWoff2Base64(600);
const INTER_700_B64 = interWoff2Base64(700);

type InterWeights = readonly (400 | 600 | 700)[];

async function loadConsentHtmlInPage(
  page: Page,
  html: string,
  interWeights: InterWeights = [400, 600, 700],
): Promise<void> {
  const faces = interWeights
    .map(
      (weight) => `@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${
    weight === 400 ? INTER_400_B64 : weight === 600 ? INTER_600_B64 : INTER_700_B64
  }) format("woff2");
}`,
    )
    .join("\n");
  const fontFace = `<style>${faces}</style>`;
  const withFont = html.includes("<head>")
    ? html.replace("<head>", `<head>${fontFace}`)
    : `${fontFace}${html}`;
  await page.setContent(withFont, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (weights) => {
    await Promise.all(
      weights.flatMap((weight) => [
        document.fonts.load(`${weight} 16px "Inter"`),
        document.fonts.load(`${weight} 11px "Inter"`),
      ]),
    );
    await document.fonts.ready;
  }, interWeights as number[]);
}

async function consentPageHtml(options: { clientName?: string }): Promise<string> {
  const doc = {
    ...createChatGptCimdDocument(),
    ...(options.clientName ? { client_name: options.clientName } : {}),
  };
  const deps = await createMcpOAuthTestDeps({
    [CHATGPT_CIMD_CLIENT_ID]: doc,
  });
  const jar = new CookieJar();
  await completeGoogleSignIn(deps, jar);
  const response = await followAuthorizeToConsent(
    deps,
    jar,
    buildAuthorizeUrl({
      clientId: CHATGPT_CIMD_CLIENT_ID,
      redirectUri: CHATGPT_REDIRECT_URI,
      verifier: randomPkceVerifier(),
      resource: mcpResourceUrl(),
    }),
  );
  expect(response.status).toBe(200);
  return response.text();
}

function expectTagPillWidth(width: number): void {
  expect(width).toBeGreaterThan(109);
  expect(width).toBeLessThan(117);
}

async function setViewportWidth(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  if (Number.isInteger(width)) {
    await page.setViewportSize({ width, height });
    return;
  }
  const session = await page.context().newCDPSession(page);
  const scale = 10;
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    deviceScaleFactor: scale,
    mobile: false,
  });
}

async function expectInter700Ready(page: Page): Promise<void> {
  const ready = await page.evaluate(async () => {
    await document.fonts.load('700 11px "Inter"');
    await document.fonts.ready;
    return document.fonts.check('700 11px "Inter"');
  });
  expect(ready).toBe(true);
}

describe("MCP OAuth consent layout (real browser, DIDI-1150)", () => {
  it("keeps the Self-reported tag on the name row inside the content box at 1280 px", async () => {
    const html = await consentPageHtml({});
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await loadConsentHtmlInPage(page, html);
      await expectInter700Ready(page);
      const boxes = await page.evaluate(() => {
        const card = document.querySelector(".consent-card");
        const lead = document.querySelector(".consent-name-lead");
        const name = document.querySelector(".consent-name-inline");
        const tag = document.querySelector(".consent-tag");
        if (!card || !lead || !name || !tag) {
          return null;
        }
        const cardStyle = getComputedStyle(card);
        const cardBox = card.getBoundingClientRect();
        const padLeft = Number.parseFloat(cardStyle.paddingLeft);
        const contentRight = cardBox.left + padLeft + card.clientWidth;
        const leadBox = lead.getBoundingClientRect();
        const nameBox = name.getBoundingClientRect();
        const tagBox = tag.getBoundingClientRect();
        return {
          nameTop: nameBox.top,
          tagTop: tagBox.top,
          tagRight: tagBox.right,
          tagWidth: tagBox.width,
          contentRight,
          cardScrollWidth: card.scrollWidth,
          cardClientWidth: card.clientWidth,
          leadRight: leadBox.right,
          nameLeft: nameBox.left,
          tagFontWeight: getComputedStyle(tag).fontWeight,
        };
      });
      expect(boxes).not.toBeNull();
      expect(Math.abs(boxes!.nameTop - boxes!.tagTop)).toBeLessThan(4);
      expect(boxes!.tagRight).toBeLessThanOrEqual(boxes!.contentRight + 0.5);
      expectTagPillWidth(boxes!.tagWidth);
      expect(boxes!.cardScrollWidth).toBeLessThanOrEqual(boxes!.cardClientWidth + 1);
      expect(boxes!.nameLeft - boxes!.leadRight).toBeGreaterThanOrEqual(7);
      expect(boxes!.tagFontWeight).toBe("700");
      const leadWhiteSpace = await page.evaluate(() => {
        const lead = document.querySelector(".consent-name-lead");
        return lead ? getComputedStyle(lead).whiteSpace : null;
      });
      expect(leadWhiteSpace).toBe("nowrap");
      const nameLineFlexWrap = await page.evaluate(() => {
        const line = document.querySelector(".consent-name-line");
        return line ? getComputedStyle(line).flexWrap : null;
      });
      expect(nameLineFlexWrap).toBe("nowrap");
    } finally {
      await browser.close();
    }
  }, 120_000);

  it("requires Inter 700 to be loaded for the Self-reported tag", async () => {
    const html = await consentPageHtml({});
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await loadConsentHtmlInPage(page, html, [400]);
      const weightsOnly400 = await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts]
          .filter((face) => face.family.replaceAll('"', "") === "Inter")
          .map((face) => face.weight);
      });
      expect(weightsOnly400).not.toContain("700");
      await loadConsentHtmlInPage(page, html, [400, 600, 700]);
      await expectInter700Ready(page);
      const weightsAll = await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts]
          .filter((face) => face.family.replaceAll('"', "") === "Inter")
          .map((face) => face.weight);
      });
      expect(weightsAll).toContain("700");
      const inter700Ready = await page.evaluate(() =>
        document.fonts.check('700 11px "Inter"'),
      );
      expect(inter700Ready).toBe(true);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it("matches mockup 01 short-name phone layout at 390 px", async () => {
    const html = await consentPageHtml({});
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await loadConsentHtmlInPage(page, html);
      await expectInter700Ready(page);
      const layout = await page.evaluate(() => {
        const card = document.querySelector(".consent-card");
        const lead = document.querySelector(".consent-name-lead");
        const name = document.querySelector(".consent-name-inline");
        const tag = document.querySelector(".consent-tag");
        if (!card || !lead || !name || !tag) {
          return null;
        }
        const leadBox = lead.getBoundingClientRect();
        const nameBox = name.getBoundingClientRect();
        const tagBox = tag.getBoundingClientRect();
        return {
          leadTop: leadBox.top,
          nameTop: nameBox.top,
          nameBottom: nameBox.bottom,
          tagTop: tagBox.top,
          tagWidth: tagBox.width,
          cardClientWidth: card.clientWidth,
          leadRight: leadBox.right,
          nameLeft: nameBox.left,
          tagFontWeight: getComputedStyle(tag).fontWeight,
        };
      });
      expect(layout).not.toBeNull();
      expect(Math.abs(layout!.leadTop - layout!.nameTop)).toBeLessThan(4);
      expect(layout!.nameLeft - layout!.leadRight).toBeGreaterThanOrEqual(5);
      expect(layout!.tagWidth).toBeLessThan(layout!.cardClientWidth * 0.45);
      expect(layout!.tagTop).toBeGreaterThanOrEqual(layout!.nameBottom - 2);
      expectTagPillWidth(layout!.tagWidth);
      expect(layout!.tagFontWeight).toBe("700");
    } finally {
      await browser.close();
    }
  }, 120_000);

  it("matches mockup 02 long-name phone layout at 390 px", async () => {
    const html = await consentPageHtml({ clientName: LONG_CLIENT_NAME_RAW });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await loadConsentHtmlInPage(page, html);
      const layout = await page.evaluate((expectedName) => {
        const lead = document.querySelector(".consent-name-lead");
        const name = document.querySelector(".consent-name-inline");
        const tag = document.querySelector(".consent-tag");
        if (!lead || !name || !tag) {
          return null;
        }
        const nameBox = name.getBoundingClientRect();
        const tagBox = tag.getBoundingClientRect();
        const nameText = name.textContent ?? "";
        if (!nameText.includes(expectedName)) {
          return { error: "name mismatch" as const };
        }
        return {
          nameTop: nameBox.top,
          nameBottom: nameBox.bottom,
          tagTop: tagBox.top,
          tagWidth: tagBox.width,
        };
      }, LONG_CLIENT_NAME_DISPLAY);
      expect(layout).not.toBeNull();
      if (!layout || "error" in layout) {
        expect.fail("expected long-name layout metrics");
      }
      const metrics = layout;
      expect(metrics.tagTop).toBeGreaterThanOrEqual(metrics.nameBottom - 2);
      expect(metrics.tagTop - metrics.nameTop).toBeGreaterThan(12);
      expectTagPillWidth(metrics.tagWidth);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it("keeps a long client name inside the card width at 1280 px", async () => {
    const html = await consentPageHtml({ clientName: LONG_CLIENT_NAME_RAW });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await loadConsentHtmlInPage(page, html);
      const cardMetrics = await page.evaluate(() => {
        const card = document.querySelector(".consent-card") as HTMLElement | null;
        if (!card) {
          return null;
        }
        return {
          clientWidth: card.clientWidth,
          scrollWidth: card.scrollWidth,
        };
      });
      expect(cardMetrics).not.toBeNull();
      expect(cardMetrics!.scrollWidth).toBeLessThanOrEqual(
        cardMetrics!.clientWidth + 1,
      );
      const nameWhiteSpace = await page.evaluate(() => {
        const name = document.querySelector(".consent-name-inline");
        return name ? getComputedStyle(name).whiteSpace : null;
      });
      expect(nameWhiteSpace).toBe("normal");
    } finally {
      await browser.close();
    }
  }, 120_000);

  it.each([390, 1280])(
    "keeps a long no-space client name inside the card at %i px",
    async (width) => {
      const html = await consentPageHtml({ clientName: LONG_NO_SPACE_NAME });
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.setViewportSize({ width, height: 900 });
        await loadConsentHtmlInPage(page, html);
        const cardMetrics = await page.evaluate(() => {
          const card = document.querySelector(".consent-card") as HTMLElement | null;
          if (!card) {
            return null;
          }
          return {
            clientWidth: card.clientWidth,
            scrollWidth: card.scrollWidth,
          };
        });
        expect(cardMetrics).not.toBeNull();
        expect(cardMetrics!.scrollWidth).toBeLessThanOrEqual(
          cardMetrics!.clientWidth + 1,
        );
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it.each([639, 639.5, 640])(
    "uses phone layout below 640 px and desktop layout at 640 px (viewport %s)",
    async (viewportWidth) => {
      const html = await consentPageHtml({});
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await setViewportWidth(page, viewportWidth, 800);
        await loadConsentHtmlInPage(page, html);
        if (viewportWidth < 640) {
          await expectInter700Ready(page);
          const phoneLayout = await page.evaluate(() => {
            const card = document.querySelector(".consent-card");
            const tag = document.querySelector(".consent-tag");
            if (!card || !tag) {
              return null;
            }
            return {
              tagWidth: tag.getBoundingClientRect().width,
              cardClientWidth: card.clientWidth,
            };
          });
          expect(phoneLayout).not.toBeNull();
          expectTagPillWidth(phoneLayout!.tagWidth);
          expect(phoneLayout!.tagWidth).toBeLessThan(
            phoneLayout!.cardClientWidth * 0.45,
          );
        } else {
          const desktopGap = await page.evaluate(() => {
            const lead = document.querySelector(".consent-name-lead");
            const name = document.querySelector(".consent-name-inline");
            if (!lead || !name) {
              return 0;
            }
            const leadBox = lead.getBoundingClientRect();
            const nameBox = name.getBoundingClientRect();
            return nameBox.left - leadBox.right;
          });
          expect(desktopGap).toBeGreaterThanOrEqual(7);
        }
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});
