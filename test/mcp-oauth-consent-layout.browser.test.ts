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

async function consentPageHtml(options: { clientName?: string } = {}): Promise<string> {
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

async function expectInter700Ready(page: Page): Promise<void> {
  const ready = await page.evaluate(async () => {
    await document.fonts.load('700 11px "Inter"');
    await document.fonts.ready;
    const weights = [...document.fonts]
      .filter((face) => face.family.replaceAll('"', "") === "Inter")
      .map((face) => face.weight);
    return weights.includes("700") && document.fonts.check('700 11px "Inter"');
  });
  expect(ready).toBe(true);
}

describe("MCP OAuth consent layout (real browser, DIDI-1150)", () => {
  it("keeps the Self-reported tag inside the card content box at 1280 px", async () => {
    const html = await consentPageHtml({});
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await loadConsentHtmlInPage(page, html);
      await expectInter700Ready(page);
      const boxes = await page.evaluate(() => {
        function readCardContentBox(card: Element) {
          const style = getComputedStyle(card);
          const box = card.getBoundingClientRect();
          const padLeft = Number.parseFloat(style.paddingLeft);
          const padRight = Number.parseFloat(style.paddingRight);
          const left = box.left + padLeft;
          const right = box.right - padRight;
          const width = right - left;
          const scrollWidth = Math.max(0, card.scrollWidth - padLeft - padRight);
          return { left, right, width, scrollWidth };
        }
        const card = document.querySelector(".consent-card");
        const tag = document.querySelector(".consent-tag");
        if (!card || !tag) {
          return null;
        }
        const content = readCardContentBox(card);
        const tagBox = tag.getBoundingClientRect();
        const contentRight =
          card.getBoundingClientRect().left +
          card.clientLeft +
          card.clientWidth -
          Number.parseFloat(getComputedStyle(card).paddingRight);
        return {
          tagRight: tagBox.right,
          tagWidth: tagBox.width,
          contentRight,
          contentScrollWidth: content.scrollWidth,
          contentClientWidth: content.width,
          tagFontWeight: getComputedStyle(tag).fontWeight,
        };
      });
      expect(boxes).not.toBeNull();
      expect(Math.abs(boxes!.contentRight - 800)).toBeLessThan(1);
      expect(boxes!.contentScrollWidth).toBeLessThanOrEqual(
        boxes!.contentClientWidth + 1,
      );
      expect(boxes!.tagRight).toBeLessThanOrEqual(boxes!.contentRight + 0.5);
      expectTagPillWidth(boxes!.tagWidth);
      expect(boxes!.tagFontWeight).toBe("700");
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
});
