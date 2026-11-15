import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Takes a picture of some sprites of a bundle, every frame, with its anchor marked, so a picture
 * can be looked at before a game uses it.
 *   tsx tools/qa/sprite-sheet.ts <out.png> 'bundle=life&names=fish-,butterfly-&scale=3&bg=grass'
 * The query is the lab page's. See tools/lab/sprites.ts.
 */
const [out = 'assets/source/_scratch/sprites.png', query = 'bundle=life'] = process.argv.slice(2);
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && console.log(`[error] ${m.text()}`));
await page.goto(`http://localhost:5173/tools/lab/sprites.html?${query}`);
await page.waitForFunction(() => document.title.includes('sprites'), undefined, { timeout: 30_000 });
const box = await page.locator('#sheet').boundingBox();
await page.screenshot(box ? { path: out, clip: box, fullPage: true } : { path: out });
console.log(await page.title());
await browser.close();
