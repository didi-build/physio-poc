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

/** shell-slate-600 from src/ui/styles/shell.css (DIDI-1125 mockup lead). */
const CONSENT_NAME_LEAD_COLOR = "rgb(71, 85, 105)";

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

describe("MCP OAuth consent layout (real browser, DIDI-1161)", () => {
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
      expect(boxes!.contentScrollWidth).toBeLessThanOrEqual(boxes!.contentClientWidth);
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

  it.each([
    { width: 390, bodyFontSize: "14px" },
    { width: 1280, bodyFontSize: "15px" },
  ] as const)(
    "pins consent name lead colour and body font at $width px",
    async ({ width, bodyFontSize }) => {
      const html = await consentPageHtml({});
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.setViewportSize({ width, height: 900 });
        await loadConsentHtmlInPage(page, html);
        const styles = await page.evaluate(() => {
          const lead = document.querySelector(".consent-name-lead");
          const bodyParagraph = document.querySelector(".consent-name-line");
          if (!lead || !bodyParagraph) {
            return null;
          }
          return {
            leadColor: getComputedStyle(lead).color,
            bodyFontSize: getComputedStyle(bodyParagraph).fontSize,
          };
        });
        expect(styles).not.toBeNull();
        expect(styles!.leadColor).toBe(CONSENT_NAME_LEAD_COLOR);
        expect(styles!.bodyFontSize).toBe(bodyFontSize);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

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
          cardScrollWidth: card.scrollWidth,
          leadRight: leadBox.right,
          nameLeft: nameBox.left,
          tagFontWeight: getComputedStyle(tag).fontWeight,
        };
      });
      expect(layout).not.toBeNull();
      expect(layout!.cardScrollWidth).toBeLessThanOrEqual(layout!.cardClientWidth);
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
        function wordsStayOnSingleLines(nameEl: Element): boolean {
          const text = nameEl.textContent ?? "";
          const words = text.match(/\S+/g) ?? [];
          for (const word of words) {
            const index = text.indexOf(word);
            if (index < 0) {
              continue;
            }
            const range = document.createRange();
            range.setStart(nameEl.firstChild ?? nameEl, index);
            range.setEnd(nameEl.firstChild ?? nameEl, index + word.length);
            const rects = range.getClientRects();
            if (rects.length === 0) {
              return false;
            }
            const firstTop = rects[0]!.top;
            for (let i = 1; i < rects.length; i += 1) {
              if (Math.abs(rects[i]!.top - firstTop) > 0.5) {
                return false;
              }
            }
          }
          return true;
        }
        function firstWordTop(nameEl: Element): number | null {
          const text = nameEl.textContent ?? "";
          const match = text.match(/\S+/);
          if (!match) {
            return null;
          }
          const index = text.indexOf(match[0]!);
          const range = document.createRange();
          range.setStart(nameEl.firstChild ?? nameEl, index);
          range.setEnd(nameEl.firstChild ?? nameEl, index + match[0]!.length);
          const rects = range.getClientRects();
          return rects.length > 0 ? rects[0]!.top : null;
        }
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
        const nameText = name.textContent ?? "";
        if (!nameText.includes(expectedName)) {
          return { error: "name mismatch" as const };
        }
        const wordTop = firstWordTop(name);
        return {
          leadBottom: leadBox.bottom,
          firstWordTop: wordTop,
          nameBottom: nameBox.bottom,
          tagTop: tagBox.top,
          tagWidth: tagBox.width,
          cardClientWidth: card.clientWidth,
          cardScrollWidth: card.scrollWidth,
          wordsSingleLine: wordsStayOnSingleLines(name),
        };
      }, LONG_CLIENT_NAME_DISPLAY);
      expect(layout).not.toBeNull();
      if (!layout || "error" in layout) {
        expect.fail("expected long-name layout metrics");
      }
      const metrics = layout;
      expect(metrics.cardScrollWidth).toBeLessThanOrEqual(metrics.cardClientWidth);
      expect(metrics.wordsSingleLine).toBe(true);
      expect(metrics.firstWordTop).not.toBeNull();
      expect(metrics.firstWordTop!).toBeGreaterThan(metrics.leadBottom + 0.5);
      expect(metrics.tagTop).toBeGreaterThanOrEqual(metrics.nameBottom - 2);
      expectTagPillWidth(metrics.tagWidth);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it("keeps the Self-reported tag below the name at the content left at 320 px", async () => {
    const html = await consentPageHtml({});
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 320, height: 700 });
      await loadConsentHtmlInPage(page, html);
      await expectInter700Ready(page);
      const layout = await page.evaluate(() => {
        const card = document.querySelector(".consent-card");
        const name = document.querySelector(".consent-name-inline");
        const tag = document.querySelector(".consent-tag");
        if (!card || !name || !tag) {
          return null;
        }
        const nameBox = name.getBoundingClientRect();
        const tagBox = tag.getBoundingClientRect();
        const padLeft = Number.parseFloat(getComputedStyle(card).paddingLeft);
        const contentLeft =
          card.getBoundingClientRect().left + card.clientLeft + padLeft;
        return {
          nameBottom: nameBox.bottom,
          tagTop: tagBox.top,
          tagLeft: tagBox.left,
          contentLeft,
          tagWidth: tagBox.width,
          cardClientWidth: card.clientWidth,
          cardScrollWidth: card.scrollWidth,
        };
      });
      expect(layout).not.toBeNull();
      expect(layout!.cardScrollWidth).toBeLessThanOrEqual(layout!.cardClientWidth);
      expect(layout!.tagTop).toBeGreaterThan(layout!.nameBottom - 0.5);
      expect(Math.abs(layout!.tagLeft - layout!.contentLeft)).toBeLessThan(1);
      expectTagPillWidth(layout!.tagWidth);
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
        const lead = document.querySelector(".consent-name-lead");
        const name = document.querySelector(".consent-name-inline");
        if (!card || !lead || !name) {
          return null;
        }
        const style = getComputedStyle(card);
        const padLeft = Number.parseFloat(style.paddingLeft);
        const padRight = Number.parseFloat(style.paddingRight);
        const box = card.getBoundingClientRect();
        const contentLeft = box.left + padLeft;
        const contentRight =
          card.getBoundingClientRect().left +
          card.clientLeft +
          card.clientWidth -
          Number.parseFloat(style.paddingRight);
        const contentWidth = contentRight - contentLeft;
        const contentScrollWidth = Math.max(0, card.scrollWidth - padLeft - padRight);
        function wordsStayOnSingleLines(nameEl: Element): boolean {
          const text = nameEl.textContent ?? "";
          const words = text.match(/\S+/g) ?? [];
          for (const word of words) {
            const index = text.indexOf(word);
            if (index < 0) {
              continue;
            }
            const range = document.createRange();
            range.setStart(nameEl.firstChild ?? nameEl, index);
            range.setEnd(nameEl.firstChild ?? nameEl, index + word.length);
            const rects = range.getClientRects();
            if (rects.length === 0) {
              return false;
            }
            const firstTop = rects[0]!.top;
            for (let i = 1; i < rects.length; i += 1) {
              if (Math.abs(rects[i]!.top - firstTop) > 0.5) {
                return false;
              }
            }
          }
          return true;
        }
        function firstWordTop(nameEl: Element): number | null {
          const text = nameEl.textContent ?? "";
          const match = text.match(/\S+/);
          if (!match) {
            return null;
          }
          const index = text.indexOf(match[0]!);
          const range = document.createRange();
          range.setStart(nameEl.firstChild ?? nameEl, index);
          range.setEnd(nameEl.firstChild ?? nameEl, index + match[0]!.length);
          const rects = range.getClientRects();
          return rects.length > 0 ? rects[0]!.top : null;
        }
        const leadBox = lead.getBoundingClientRect();
        const wordTop = firstWordTop(name);
        return {
          contentRight,
          contentWidth,
          contentScrollWidth,
          wordsSingleLine: wordsStayOnSingleLines(name),
          nameMinWidth: getComputedStyle(name).minWidth,
          nameWidth: name.getBoundingClientRect().width,
          leadBottom: leadBox.bottom,
          firstWordTop: wordTop,
        };
      });
      expect(cardMetrics).not.toBeNull();
      expect(Math.abs(cardMetrics!.contentRight - 800)).toBeLessThan(1);
      expect(cardMetrics!.contentScrollWidth).toBeLessThanOrEqual(
        cardMetrics!.contentWidth,
      );
      expect(cardMetrics!.wordsSingleLine).toBe(true);
      expect(Number.parseFloat(cardMetrics!.nameMinWidth)).toBe(0);
      expect(cardMetrics!.nameWidth).toBeGreaterThan(40);
      expect(cardMetrics!.firstWordTop).not.toBeNull();
      expect(cardMetrics!.firstWordTop!).toBeGreaterThan(cardMetrics!.leadBottom + 0.5);
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
          function firstWordTop(nameEl: Element): number | null {
            const text = nameEl.textContent ?? "";
            const match = text.match(/\S+/);
            if (!match) {
              return null;
            }
            const index = text.indexOf(match[0]!);
            const range = document.createRange();
            range.setStart(nameEl.firstChild ?? nameEl, index);
            range.setEnd(nameEl.firstChild ?? nameEl, index + match[0]!.length);
            const rects = range.getClientRects();
            return rects.length > 0 ? rects[0]!.top : null;
          }
          const card = document.querySelector(".consent-card") as HTMLElement | null;
          const lead = document.querySelector(".consent-name-lead");
          const name = document.querySelector(".consent-name-inline");
          if (!card || !lead || !name) {
            return null;
          }
          const leadBox = lead.getBoundingClientRect();
          const wordTop = firstWordTop(name);
          return {
            clientWidth: card.clientWidth,
            scrollWidth: card.scrollWidth,
            leadBottom: leadBox.bottom,
            firstWordTop: wordTop,
          };
        });
        expect(cardMetrics).not.toBeNull();
        expect(cardMetrics!.scrollWidth).toBeLessThanOrEqual(cardMetrics!.clientWidth);
        if (width === 390) {
          expect(cardMetrics!.firstWordTop).not.toBeNull();
          expect(cardMetrics!.firstWordTop!).toBeGreaterThan(
            cardMetrics!.leadBottom + 0.5,
          );
        }
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it.each([639, 640])(
    "uses phone layout below 640 px and desktop layout at 640 px (viewport %i)",
    async (viewportWidth) => {
      const html = await consentPageHtml({});
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.setViewportSize({ width: viewportWidth, height: 800 });
        await loadConsentHtmlInPage(page, html);
        if (viewportWidth < 640) {
          await expectInter700Ready(page);
          const phoneLayout = await page.evaluate(() => {
            const card = document.querySelector(".consent-card");
            const tag = document.querySelector(".consent-tag");
            const nameLine = document.querySelector(".consent-name-line");
            if (!card || !tag || !nameLine) {
              return null;
            }
            return {
              tagWidth: tag.getBoundingClientRect().width,
              cardClientWidth: card.clientWidth,
              nameLineDisplay: getComputedStyle(nameLine).display,
            };
          });
          expect(phoneLayout).not.toBeNull();
          expect(phoneLayout!.nameLineDisplay).toBe("flex");
          expectTagPillWidth(phoneLayout!.tagWidth);
          expect(phoneLayout!.tagWidth).toBeLessThan(
            phoneLayout!.cardClientWidth * 0.45,
          );
        } else {
          await expectInter700Ready(page);
          const desktopLayout = await page.evaluate(() => {
            const card = document.querySelector(".consent-card");
            const lead = document.querySelector(".consent-name-lead");
            const name = document.querySelector(".consent-name-inline");
            const tag = document.querySelector(".consent-tag");
            const nameLine = document.querySelector(".consent-name-line");
            if (!card || !lead || !name || !tag || !nameLine) {
              return null;
            }
            const leadBox = lead.getBoundingClientRect();
            const nameBox = name.getBoundingClientRect();
            const tagBox = tag.getBoundingClientRect();
            const contentRight =
              card.getBoundingClientRect().left +
              card.clientLeft +
              card.clientWidth -
              Number.parseFloat(getComputedStyle(card).paddingRight);
            return {
              gap: nameBox.left - leadBox.right,
              tagRight: tagBox.right,
              contentRight,
              nameLineDisplay: getComputedStyle(nameLine).display,
              nameLineFlexWrap: getComputedStyle(nameLine).flexWrap,
            };
          });
          expect(desktopLayout).not.toBeNull();
          expect(desktopLayout!.nameLineDisplay).toBe("flex");
          expect(desktopLayout!.nameLineFlexWrap).toBe("wrap");
          expect(desktopLayout!.gap).toBeGreaterThanOrEqual(5);
          expect(desktopLayout!.tagRight).toBeLessThanOrEqual(
            desktopLayout!.contentRight + 0.5,
          );
        }
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});
