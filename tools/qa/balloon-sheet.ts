import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Takes a picture of the balloon art sheet: every balloon, face and foil, large, on a sky.
 *   tsx tools/qa/balloon-sheet.ts <out.png> 'sky=day&zoom=3&dpr=1'
 */
const [out = 'assets/source/_scratch/balloons.png', query = ''] = process.argv.slice(2);
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && console.log(`[error] ${m.text()}`));
await page.goto(`http://localhost:5173/tools/lab/balloons.html?${query}`);
await page.waitForTimeout(500);
const box = await page.locator('#sheet').boundingBox();
await page.screenshot(box ? { path: out, clip: box } : { path: out });
await browser.close();
