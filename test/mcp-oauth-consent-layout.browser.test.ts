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

const INTER_WOFF2 = join(
  dirname(fileURLToPath(import.meta.url)),
  "../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
);
const INTER_WOFF2_B64 = readFileSync(INTER_WOFF2).toString("base64");

async function loadConsentHtmlInPage(page: Page, html: string): Promise<void> {
  const fontFace = `<style>
@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(data:font/woff2;base64,${INTER_WOFF2_B64}) format("woff2");
}
</style>`;
  const withFont = html.includes("<head>")
    ? html.replace("<head>", `<head>${fontFace}`)
    : `${fontFace}${html}`;
  await page.setContent(withFont, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
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
  it("keeps the Self-reported tag on the same row as the quoted name at 1280 px", async () => {
    const html = await consentPageHtml({});
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await loadConsentHtmlInPage(page, html);
      const boxes = await page.evaluate(() => {
        const name = document.querySelector(".consent-name-inline");
        const tag = document.querySelector(".consent-tag");
        if (!name || !tag) {
          return null;
        }
        const nameBox = name.getBoundingClientRect();
        const tagBox = tag.getBoundingClientRect();
        return { nameTop: nameBox.top, tagTop: tagBox.top, tagBottom: tagBox.bottom };
      });
      expect(boxes).not.toBeNull();
      expect(Math.abs(boxes!.nameTop - boxes!.tagTop)).toBeLessThan(4);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it("matches mockup 02 long-name arrangement at 390 px", async () => {
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
          leadBottom: leadBox.bottom,
          nameTop: nameBox.top,
          nameBottom: nameBox.bottom,
          tagTop: tagBox.top,
          leadDisplay: getComputedStyle(lead).display,
          tagDisplay: getComputedStyle(tag).display,
        };
      }, LONG_CLIENT_NAME_DISPLAY);
      expect(layout).not.toBeNull();
      if (!layout || "error" in layout) {
        expect.fail("expected long-name layout metrics");
      }
      const metrics = layout;
      expect(metrics.leadDisplay).toBe("block");
      expect(metrics.tagDisplay).toBe("block");
      expect(metrics.nameTop).toBeGreaterThanOrEqual(metrics.leadBottom - 2);
      expect(metrics.tagTop).toBeGreaterThanOrEqual(metrics.nameBottom - 2);
      expect(metrics.tagTop - metrics.nameTop).toBeGreaterThan(12);
    } finally {
      await browser.close();
    }
  }, 120_000);
});
