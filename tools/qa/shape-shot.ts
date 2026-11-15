import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Takes a picture of one constellation of the star cannon, lit, with the shape of light behind it.
 *   tsx tools/qa/shape-shot.ts <out.png> 'look=star&w=640&numbers=1'
 * The query is the lab page's: look=star|heart, w (width in units), flip=1, shape (0 to 1, how much
 * of the shape shows), numbers=1, lines=0, stars=0. It prints how near the two closest stars are,
 * against how near they need to be.
 */
const [out = 'assets/source/_scratch/shape.png', query = ''] = process.argv.slice(2);
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && console.log(`[error] ${m.text()}`));
await page.goto(`http://localhost:5173/tools/lab/shape.html?${query}`);
await page.waitForTimeout(400);
const box = await page.locator('#sheet').boundingBox();
await page.screenshot(box ? { path: out, clip: box } : { path: out });
console.log(await page.title());
await browser.close();
