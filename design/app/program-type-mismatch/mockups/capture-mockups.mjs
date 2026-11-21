/**
 * One-off mockup capture for DIDI-1105 (not wired into npm run check).
 * Renders approved heading-only banner and Fix-open state at 390 px and 1280 px.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

function pageHtml({ fixOpen }) {
  const fixPanel = fixOpen
    ? `
    <div class="fix-panel">
      <button type="button" class="type-choice"><span class="type-name">Isometric</span><span class="type-hint">Hold still under load</span></button>
      <button type="button" class="type-choice"><span class="type-name">Concentric</span><span class="type-hint">Lift or push with control</span></button>
      <button type="button" class="type-choice"><span class="type-name">Eccentric</span><span class="type-hint">Lower slowly</span></button>
      <button type="button" class="pick-other">Pick another exercise</button>
    </div>`
  : "";

  const fixBtn = fixOpen ? "Fix" : "Fix";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
  .frame { width: 100%; max-width: 100%; margin: 0 auto; background: #f8fafc; min-height: 100vh; }
  .header { height: 56px; border-bottom: 1px solid #e2e8f0; background: rgba(255,255,255,.95); display: flex; align-items: center; padding: 0 16px; gap: 10px; }
  .logo { width: 32px; height: 32px; border-radius: 8px; background: #0f766e; color: #fff; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; }
  .brand { font-size: 15px; font-weight: 600; }
  main { padding: 12px 16px 96px; }
  .back { font-size: 14px; font-weight: 600; color: #115e59; margin-bottom: 8px; }
  h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; display: inline; }
  .code { display: inline-block; margin-left: 8px; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; vertical-align: middle; }
  label { display: block; margin-top: 12px; font-size: 14px; font-weight: 600; }
  input { margin-top: 6px; width: 100%; height: 44px; border-radius: 12px; border: 1px solid #e2e8f0; padding: 0 12px; font-size: 16px; }
  .banner { margin-top: 12px; display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-radius: 16px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; font-size: 14px; }
  .banner-title { font-weight: 600; }
  .show-me { margin-left: auto; flex-shrink: 0; font-size: 14px; font-weight: 600; color: #115e59; background: transparent; border: none; min-height: 44px; padding: 0 8px; }
  .section-h { margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }
  .section-h h2 { font-size: 16px; font-weight: 600; }
  .count { font-size: 14px; color: #64748b; }
  .rows { margin-top: 8px; display: flex; flex-direction: column; gap: 12px; }
  .row { border-radius: 16px; border: 1px solid #e2e8f0; border-left: 4px solid #f97316; background: #fff; padding: 12px; }
  .row-head { display: flex; align-items: flex-start; gap: 8px; }
  .thumb { width: 56px; height: 44px; border-radius: 8px; background: #f0fdfa; border: 1px solid #e2e8f0; flex-shrink: 0; }
  .row-title { font-weight: 600; font-size: 15px; line-height: 1.35; }
  .badge-row { margin-top: 4px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; background: #ffedd5; color: #9a3412; font-weight: 600; border: 1px solid #fdba74; }
  .row-type { color: #64748b; font-size: 12px; }
  .reason-row { margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: #475569; }
  .fix-btn { margin-left: auto; flex-shrink: 0; min-height: 40px; padding: 0 12px; border-radius: 12px; border: 1px solid #cbd5e1; background: #fff; color: #115e59; font-size: 14px; font-weight: 600; }
  .fix-panel { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .type-choice { text-align: left; min-height: 48px; padding: 10px 12px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; }
  .type-name { display: block; font-size: 14px; font-weight: 600; }
  .type-hint { display: block; font-size: 12px; color: #64748b; margin-top: 2px; }
  .pick-other { text-align: left; min-height: 44px; padding: 8px 4px; border: none; background: transparent; color: #115e59; font-size: 14px; font-weight: 600; }
  @media (min-width: 1024px) {
    main { max-width: 768px; margin: 0 auto; padding: 24px 32px 48px; }
  }
</style>
</head>
<body>
<div class="frame">
  <header class="header"><div class="logo">D</div><div class="brand">Didi Physio</div></header>
  <main>
    <div class="back">‹ Programs</div>
    <div><h1>Build program</h1><span class="code">Code PRG-7K3Q</span></div>
    <label for="pn">Program name</label>
    <input id="pn" value="Knee rehab, week 1" readonly />
    <div class="banner"><div><div class="banner-title">1 exercise didn't link</div></div><button type="button" class="show-me">Show me</button></div>
    <div class="section-h"><h2>Exercises</h2><span class="count">3 total</span></div>
    <div class="rows">
      <article class="row" style="border-left-color:#a78bfa">
        <div class="row-head"><div class="thumb"></div><div><div class="row-title">Straight leg raise, rehab</div><div class="badge-row"><span style="color:#6b21a8;font-size:12px;font-weight:600">Concentric</span></div></div></div>
      </article>
      <article class="row">
        <div class="row-head"><div class="thumb"></div><div class="min"><div class="row-title">Bridge marching</div><div class="badge-row"><span class="badge">Didn't link</span><span class="row-type">Row type: Stretching</span></div></div></div>
        <div class="reason-row"><span>Approved as strengthening. Change the type to link it.</span><button type="button" class="fix-btn" aria-expanded="${fixOpen ? "true" : "false"}">${fixBtn}</button></div>
        ${fixPanel}
      </article>
    </div>
  </main>
</div>
</body>
</html>`;
}

async function capture(name, width, height, fixOpen) {
  const html = pageHtml({ fixOpen });
  const htmlPath = join(dir, `_capture-${name}.html`);
  writeFileSync(htmlPath, html);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: height ?? 1200 } });
    await page.goto(`file://${htmlPath}`);
    await page.waitForTimeout(100);
    const out = join(dir, `${name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    return out;
  } finally {
    await browser.close();
  }
}

await capture("01-builder-banner-phone", 390, 900, false);
await capture("02-builder-fix-expanded-phone", 390, 1100, true);
await capture("02-builder-fix-expanded-desktop", 1280, 1100, true);

console.log("Captured mockups in", dir);