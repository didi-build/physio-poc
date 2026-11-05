import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

const FONT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/@fontsource/inter/files",
);

function interWoff2Base64(weight: 400 | 600 | 700): string {
  const file = join(FONT_DIR, `inter-latin-${weight}-normal.woff2`);
  return readFileSync(file).toString("base64");
}

const INTER_400_B64 = interWoff2Base64(400);
const INTER_600_B64 = interWoff2Base64(600);
const INTER_700_B64 = interWoff2Base64(700);

type InterWeights = readonly (400 | 600 | 700)[];

export async function loadInterFontsInPage(
  page: Page,
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
  await page.addInitScript((fontCss) => {
    const style = document.createElement("style");
    style.textContent = fontCss;
    document.head.append(style);
  }, faces);
  await page.evaluate(async (weights) => {
    await Promise.all(
      weights.flatMap((weight) => [
        document.fonts.load(`${weight} 16px "Inter"`),
        document.fonts.load(`${weight} 14px "Inter"`),
      ]),
    );
    await document.fonts.ready;
  }, interWeights as number[]);
}
