import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { args, flag } from '../lib/args';
import { ORIGIN } from './origin';
import { silence } from './silence';

/**
 * Opens the running game at a chosen device size and takes pictures, for looking at the real thing.
 *   tsx tools/qa/shot.ts <out.png> [--w 844] [--h 390] [--dpr 3] [--play] [--tap x,y] [--wait ms] [--at x,y] [--low on|off|auto]
 * `--low` writes the low-end setting and reloads before anything else, to see how a device in that
 * mode draws. `--go map[,spawn]` goes through a door first (palace-garden, treasure-house, stable).
 * `--fx id[,id]` plays effects at `--fxat x,y` (default: just east of Wildstar) for `--fxsec`
 * seconds. `--clip x,y,w,h` crops the picture to a region in CSS pixels. `--play` presses the play
 * button first. `--click` clicks the first page element that matches a selector, such as the map
 * button `[data-content-id="world.map.open"]`. `--tap` taps a world position. `--at` teleports Wildstar there before the shot.
 */
const out = args[0] ?? 'assets/source/_scratch/shot.png';
const width = Number(flag('w', '844'));
const height = Number(flag('h', '390'));
const dpr = Number(flag('dpr', '3'));
const wait = Number(flag('wait', '1500'));
const url = flag('url', `${ORIGIN}/?test`);

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __ua?: unknown }).__ua !== undefined, undefined, {
    timeout: 120_000,
  });
}

mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true });
await silence(context);
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(url);
await ready(page);
const low = flag('low', '');
if (low) {
  await page.evaluate(async (mode) => {
    const { settings } = (
      window as unknown as { __ua: { settings: { update(patch: { lowEnd: string }): void; flush(): Promise<void> } } }
    ).__ua;
    settings.update({ lowEnd: mode });
    await settings.flush();
  }, low);
  await page.reload();
  await ready(page);
}
await page.waitForTimeout(1200);

if (args.includes('--play')) {
  await page.getByRole('button', { name: 'Play' }).click({ force: true });
  await page.waitForTimeout(900);
}
const go = flag('go', '');
if (go) {
  const [mapId, spawnOverride] = go.split(',') as [string, string | undefined];
  const spawnId =
    spawnOverride ?? (mapId === 'palace-garden' || mapId === 'crystal-cave' ? 'from-forest' : 'from-garden');
  await page.evaluate(
    ([m, s]) =>
      (
        window as unknown as { __ua: { controller: { travel(to: { mapId: string; spawnId: string }): Promise<void> } } }
      ).__ua.controller.travel({ mapId: m!, spawnId: s! }),
    [mapId, spawnId] as const,
  );
  await page.waitForTimeout(800);
}
const at = flag('at', '');
if (at) {
  const [x, y] = at.split(',').map(Number) as [number, number];
  await page.evaluate(
    ([px, py]) =>
      (
        window as unknown as { __ua: { controller: { debugTeleport(to: { x: number; y: number }): void } } }
      ).__ua.controller.debugTeleport({ x: px!, y: py! }),
    [x, y] as const,
  );
}
const fxId = flag('fx', '');
if (fxId) {
  const fxAt = flag('fxat', '');
  const [fx, fy] = fxAt ? fxAt.split(',').map(Number) : [NaN, NaN];
  await page.evaluate(
    ([id, px, py, seconds]) => {
      const ua = (
        window as unknown as {
          __ua: {
            controller: {
              world: { unicorns: Record<string, { pos: { x: number; y: number } }> };
              debugEffect(id: string, at: { x: number; y: number }, seconds: number, facing?: string): void;
            };
          };
        }
      ).__ua;
      const w = ua.controller.world.unicorns.wildstar!.pos;
      for (const one of String(id).split(','))
        ua.controller.debugEffect(
          one,
          { x: Number.isFinite(px) ? (px as number) : w.x + 140, y: Number.isFinite(py) ? (py as number) : w.y },
          seconds as number,
          'east',
        );
    },
    [fxId, fx ?? NaN, fy ?? NaN, Number(flag('fxsec', '2.4'))] as const,
  );
}
const click = flag('click', '');
if (click) await page.locator(click).first().click();
const tap = flag('tap', '');
if (tap) {
  const [x, y] = tap.split(',').map(Number) as [number, number];
  await page.evaluate(
    ([px, py]) =>
      (window as unknown as { __ua: { controller: { tap(p: { x: number; y: number }): void } } }).__ua.controller.tap({
        x: px!,
        y: py!,
      }),
    [x, y] as const,
  );
}
await page.waitForTimeout(wait);
const clip = flag('clip', '');
if (clip) {
  const [x, y, w, h] = clip.split(',').map(Number) as [number, number, number, number];
  await page.screenshot({ path: out, clip: { x, y, width: w, height: h } });
} else await page.screenshot({ path: out });
console.log(`wrote ${out}`);
await browser.close();
