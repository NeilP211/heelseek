#!/usr/bin/env node
// Renders public/preview.png, the 1200x630 card that link previews show.
// Run with: node scripts/make-preview.mjs   (needs playwright available)
//
// Kept as a script rather than a build step because the card only changes when
// the branding does, and CI should not need a browser to deploy.

import { writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const stats = JSON.parse(await readFile(resolve(ROOT, 'public/data/events.json'), 'utf8')).counts;

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen:wght@400;700&family=Chakra+Petch:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px;
    background: #0b0d10;
    background-image: radial-gradient(circle at 12% -20%, rgba(75,156,211,0.30), transparent 60%);
    color: #e9edf2;
    font-family: 'Chakra Petch', system-ui, sans-serif;
    padding: 72px 76px;
    display: flex; flex-direction: column; justify-content: space-between;
    border-bottom: 10px solid #4b9cd3;
  }
  h1 {
    font-family: 'Press Start 2P', monospace; font-weight: 400;
    font-size: 66px; letter-spacing: 0.02em; color: #4b9cd3; line-height: 1.1;
    text-shadow: 5px 5px 0 rgba(0,0,0,0.5);
  }
  .tag { font-size: 40px; color: #c3ccd6; margin-top: 20px; }
  .stats { display: flex; gap: 56px; font-family: 'Silkscreen', monospace; }
  .stat b { display: block; font-size: 60px; color: #e9edf2; line-height: 1.1; }
  .stat span { font-size: 21px; color: #8b96a5; letter-spacing: 0.06em; }
  .food b { color: #ffc857; }
  .url {
    font-family: 'Silkscreen', monospace; font-size: 20px; color: #4b9cd3;
    border: 2px solid #2f6a92; padding: 12px 18px; align-self: flex-start;
  }
</style></head>
<body>
  <div>
    <h1>HEELSEEK</h1>
    <div class="tag">All UNC events</div>
  </div>
  <div class="stats">
    <div class="stat"><b>${stats.total.toLocaleString('en-US')}</b><span>EVENTS</span></div>
    <div class="stat food"><b>${stats.freeFood}</b><span>WITH FREE FOOD</span></div>
    <div class="stat"><b>7</b><span>CAMPUS CALENDARS</span></div>
  </div>
  <div class="url">neilp211.github.io/heelseek</div>
</body></html>`;

const tmp = resolve(ROOT, 'public/.preview.html');
await writeFile(tmp, html);

// Playwright is deliberately NOT a dependency: its postinstall downloads a
// browser, and CI never needs one because preview.png is committed. Install it
// on demand with `npm i -D playwright && npx playwright install chromium`.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed. Run:\n  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${tmp}`);
await page.waitForTimeout(1200); // let the webfonts land
await page.screenshot({ path: resolve(ROOT, 'public/preview.png') });
await browser.close();

const { unlink } = await import('node:fs/promises');
await unlink(tmp);
console.log('wrote public/preview.png');
