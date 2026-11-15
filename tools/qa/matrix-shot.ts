import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { args, flag, flags } from '../lib/args';
import { ORIGIN } from './origin';

/**
 * Takes a picture of the tone matrix in the lab, at the size of a screen, after some play, for
 * looking at every part and every state of it. The lab steps the game only when told, so a picture
 * is the game at an exact moment.
 *   tsx tools/qa/matrix-shot.ts <out.png> [--w 863] [--h 360] [--dpr 2] [--tab beat] [--at 4] [--eval "lab.step(1)"]
 * `--tab` taps the tab of a part first, as a finger would. `--at` is how many seconds of play come
 * before the picture, split between before and after the tab. `--eval` may repeat, runs in the page
 * with `lab` and `plan` (the layout) in reach, and goes last.
 */
const out = args[0] ?? 'assets/source/_scratch/matrix-shot.png';

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
await page.goto(
  `${ORIGIN}/tools/lab/wonder.html?game=tone-matrix&manual=1&seed=${flag('seed', '7')}${flag('query') ? `&${flag('query')}` : ''}`,
);
await page.waitForFunction(() => (window as unknown as { lab?: unknown }).lab !== undefined);

const at = Number(flag('at', '4'));
await page.evaluate(
  ({ tab, seconds }) => {
    const { lab } = window as unknown as {
      lab: {
        step(s: number): void;
        tap(x: number, y: number): void;
        wonder: { inspect(): { plan: { tabs: { id: string; x: number; y: number; w: number; h: number }[] } } };
      };
    };
    lab.step(seconds / 2);
    if (tab) {
      const t = lab.wonder.inspect().plan.tabs.find((q) => q.id === tab);
      if (!t) throw new Error(`no tab called ${tab}`);
      lab.tap(t.x + t.w / 2, t.y + t.h / 2);
    }
    lab.step(seconds / 2);
  },
  { tab: flag('tab'), seconds: at },
);
for (const code of flags('eval')) {
  await page.evaluate(`(() => { const lab = window.lab; const plan = lab.wonder.inspect().plan; ${code}; })()`);
}
await page.waitForTimeout(150);
await page.screenshot({ path: out });
await browser.close();
console.log(out);
