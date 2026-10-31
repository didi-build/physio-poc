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

async function loadConsentHtmlInPage(page: Page, html: string): Promise<void> {
  const fontFace = `<style>
@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(data:font/woff2;base64,${INTER_400_B64}) format("woff2");
}
@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url(data:font/woff2;base64,${INTER_600_B64}) format("woff2");
}
@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(data:font/woff2;base64,${INTER_700_B64}) format("woff2");
}
</style>`;
  const withFont = html.includes("<head>")
    ? html.replace("<head>", `<head>${fontFace}`)
    : `${fontFace}${html}`;
  await page.setContent(withFont, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 16px "Inter"'),
      document.fonts.load('600 16px "Inter"'),
      document.fonts.load('700 16px "Inter"'),
      document.fonts.load('700 11px "Inter"'),
    ]);
    await document.fonts.ready;
  });
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

describe("MCP OAuth consent layout (real browser, DIDI-1150)", () => {
  it("keeps the Self-reported tag on the name row inside the card at 1280 px", async () => {
    const html = await consentPageHtml({});
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await loadConsentHtmlInPage(page, html);
      const boxes = await page.evaluate(() => {
        const card = document.querySelector(".consent-card");
        const name = document.querySelector(".consent-name-inline");
        const tag = document.querySelector(".consent-tag");
        if (!card || !name || !tag) {
          return null;
        }
        const cardBox = card.getBoundingClientRect();
        const nameBox = name.getBoundingClientRect();
        const tagBox = tag.getBoundingClientRect();
        return {
          nameTop: nameBox.top,
          tagTop: tagBox.top,
          tagRight: tagBox.right,
          tagWidth: tagBox.width,
          cardRight: cardBox.right,
          cardClientWidth: card.clientWidth,
          cardScrollWidth: card.scrollWidth,
        };
      });
      expect(boxes).not.toBeNull();
      expect(Math.abs(boxes!.nameTop - boxes!.tagTop)).toBeLessThan(4);
      expect(boxes!.tagRight).toBeLessThanOrEqual(boxes!.cardRight + 0.5);
      expect(boxes!.tagWidth).toBeGreaterThan(95);
      expect(boxes!.tagWidth).toBeLessThan(130);
      expect(boxes!.cardScrollWidth).toBeLessThanOrEqual(boxes!.cardClientWidth + 1);
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
      const layout = await page.evaluate(() => {
        const lead = document.querySelector(".consent-name-lead");
        const name = document.querySelector(".consent-name-inline");
        const tag = document.querySelector(".consent-tag");
        if (!lead || !name || !tag) {
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
        };
      });
      expect(layout).not.toBeNull();
      expect(Math.abs(layout!.leadTop - layout!.nameTop)).toBeLessThan(4);
      expect(layout!.tagTop).toBeGreaterThanOrEqual(layout!.nameBottom - 2);
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
        const leadBox = lead.getBoundingClientRect();
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
          leadBottom: leadBox.bottom,
        };
      }, LONG_CLIENT_NAME_DISPLAY);
      expect(layout).not.toBeNull();
      if (!layout || "error" in layout) {
        expect.fail("expected long-name layout metrics");
      }
      const metrics = layout;
      expect(metrics.tagTop).toBeGreaterThanOrEqual(metrics.nameBottom - 2);
      expect(metrics.tagTop - metrics.nameTop).toBeGreaterThan(12);
      expect(metrics.tagWidth).toBeGreaterThan(95);
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
    } finally {
      await browser.close();
    }
  }, 120_000);
});
