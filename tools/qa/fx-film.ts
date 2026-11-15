import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { contactSheet, type Rgba } from '../art/core/image';
import { args, flag } from '../lib/args';
import { decodePng, encodePngRgba } from '../lib/png';
import { silence } from './silence';

/**
 * Plays one effect in the real game with time frozen, and photographs it at chosen moments, side by
 * side.
 *   tsx tools/qa/fx-film.ts <out.png> --fx 'light-burst;leaf-burst' [--times 0.05,0.2,0.4,0.7,1.1] [--crop 300x260] [--dpr 2] [--seconds 2.4] [--facing east] [--dx 0] [--dy 0]
 */
const out = args[0] ?? 'assets/source/_scratch/fx-film.png';
const ids = flag('fx', 'light-burst');
const times = flag('times', '0.05,0.2,0.4,0.7,1.1').split(',').map(Number);
const [cropW, cropH] = flag('crop', '300x260').split('x').map(Number) as [number, number];
const dpr = Number(flag('dpr', '2'));
const seconds = Number(flag('seconds', '2.4'));
const facing = flag('facing', 'east');
const dx = Number(flag('dx', '0'));
const dy = Number(flag('dy', '0'));
const url = flag('url', 'http://localhost:5173/?test');

type Ua = {
  controller: {
    debugClearEffects(): void;
    world: { unicorns: Record<string, { pos: { x: number; y: number } }> };
    toScreen(p: { x: number; y: number }): { x: number; y: number };
    debugFreeze(on: boolean): void;
    debugStep(s: number): void;
    debugEffect(id: string, at: { x: number; y: number }, s: number, f?: string): void;
  };
};

mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: dpr,
  hasTouch: true,
});
await silence(context);
const page = await context.newPage();
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => (window as unknown as { __ua?: unknown }).__ua !== undefined, undefined, {
  timeout: 120_000,
});
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Play' }).click({ force: true });
await page.waitForTimeout(2600);

const rows: Rgba[][] = [];
for (const id of ids.split(';')) {
  await page.evaluate(() => (window as unknown as { __ua: Ua }).__ua.controller.debugClearEffects());
  const world = await page.evaluate(
    ([one, sec, face, ox, oy]) => {
      const ua = (window as unknown as { __ua: Ua }).__ua;
      const w = ua.controller.world.unicorns.wildstar!.pos;
      const at = { x: w.x + (ox as number), y: w.y + (oy as number) };
      ua.controller.debugFreeze(true);
      for (const part of String(one).split(',')) ua.controller.debugEffect(part, at, sec as number, face as string);
      return at;
    },
    [id, seconds, facing, dx, dy] as const,
  );
  const frames: Rgba[] = [];
  let now = 0;
  for (const t of times) {
    await page.evaluate(
      (d) => (window as unknown as { __ua: Ua }).__ua.controller.debugStep(d),
      Math.max(0.001, t - now),
    );
    now = t;
    await page.waitForTimeout(140);
    const point = await page.evaluate((p) => (window as unknown as { __ua: Ua }).__ua.controller.toScreen(p), world);
    const x = Math.max(0, Math.min(844 - cropW, point.x - cropW / 2));
    const y = Math.max(0, Math.min(390 - cropH, point.y - cropH * 0.62));
    const png = decodePng(new Uint8Array(await page.screenshot({ clip: { x, y, width: cropW, height: cropH } })));
    frames.push({ width: png.width, height: png.height, data: png.data });
  }
  rows.push(frames);
  console.log(`filmed ${id}`);
}
const strips = rows.map((frames) =>
  contactSheet(frames, { cols: frames.length, scale: 1, gap: 4, bg: [10, 10, 20, 255] }),
);
const sheet = contactSheet(strips, { cols: 1, scale: 1, gap: 4, bg: [10, 10, 20, 255] });
writeFileSync(out, encodePngRgba({ width: sheet.width, height: sheet.height, data: sheet.data }));
console.log(`wrote ${out} (${times.join(', ')} s)`);
await browser.close();
