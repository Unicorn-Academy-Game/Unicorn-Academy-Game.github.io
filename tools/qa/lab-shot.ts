import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { args, flag, flags } from '../lib/args';

/**
 * Takes pictures of the parent controls in the lab page, for looking at every state.
 *   tsx tools/qa/lab-shot.ts <out.png> [--w 863] [--h 360] [--dpr 2] [--base http://localhost:5173] [--query name=value] [--hold] [--tab Saving]
 *     [--eval "lab.shelf.set([])"] [--click "Start over…"] [--then "document.querySelector('.words').open = true"] [--wait 400] [--scroll 300]
 * Steps run in the order: eval, hold the gear, choose the tab, click, then (the same as eval, once
 * the page is open), scroll. `--eval`, `--click` and `--then` may repeat.
 */
const out = args[0] ?? 'assets/source/_scratch/lab.png';

mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: Number(flag('w', '863')), height: Number(flag('h', '360')) },
  deviceScaleFactor: Number(flag('dpr', '2')),
  hasTouch: true,
});
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
const base = flag('base', 'http://localhost:5173');
const query = flag('query');
await page.goto(`${base}/tools/lab/parent.html${query ? `?${query}` : ''}`);
await page.waitForFunction(() => (window as unknown as { lab?: unknown }).lab !== undefined);
await page.waitForTimeout(500);

for (const code of flags('eval')) await page.evaluate(code);
if (args.includes('--hold')) {
  const box = (await page.getByRole('button', { name: /Parent controls/ }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(Number(flag('holdms', '1300')));
  await page.mouse.up();
  await page.waitForTimeout(400);
}
const tab = flag('tab');
if (tab) {
  await page.getByRole('tab', { name: tab }).click();
  await page.waitForTimeout(250);
}
for (const label of flags('click')) {
  await page.getByRole('button', { name: label }).first().click();
  await page.waitForTimeout(350);
}
for (const code of flags('then')) await page.evaluate(code);
const scroll = Number(flag('scroll', '0'));
if (scroll) await page.evaluate((y) => document.querySelector('.parent-page')?.scrollTo(0, y), scroll);
await page.waitForTimeout(Number(flag('wait', '300')));
await page.screenshot({ path: out });
await browser.close();
console.log(out);
