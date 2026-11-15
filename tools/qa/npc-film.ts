import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { contactSheet, type Rgba } from '../art/core/image';
import { args, flag } from '../lib/args';
import { decodePng, encodePngRgba } from '../lib/png';
import { silence } from './silence';

/**
 * Follows a grown-up in the real game with time frozen and photographs them at chosen moments, side
 * by side.
 *   tsx tools/qa/npc-film.ts <out.png> --npc gardener --go palace-garden --at 800,1740 [--every 1.5] [--count 12] [--crop 180x200] [--cols 6] [--dpr 2] [--lead 150,40]
 */
const out = args[0] ?? 'assets/source/_scratch/npc-film.png';
const npc = flag('npc', 'gardener');
const go = flag('go', 'palace-garden');
const at = flag('at', '800,1740');
const every = Number(flag('every', '1.5'));
const count = Number(flag('count', '12'));
const [cropW, cropH] = flag('crop', '180x200').split('x').map(Number) as [number, number];
const cols = Number(flag('cols', '6'));
const dpr = Number(flag('dpr', '2'));
const [leadX, leadY] = flag('lead', '150,40').split(',').map(Number) as [number, number];
const url = flag('url', 'http://localhost:5173/?test');

type Ua = {
  controller: {
    world: { npcs: { id: string; pos: { x: number; y: number }; anim: { clip: string; facing: string } }[] };
    toScreen(p: { x: number; y: number }): { x: number; y: number };
    debugFreeze(on: boolean): void;
    debugStep(s: number): void;
    travel(to: { mapId: string; spawnId: string }): Promise<void>;
    debugTeleport(to: { x: number; y: number }): void;
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
await page.waitForTimeout(1500);
const spawnId = go === 'palace-garden' ? 'from-forest' : 'from-garden';
await page.evaluate(
  ([m, s]) => (window as unknown as { __ua: Ua }).__ua.controller.travel({ mapId: m!, spawnId: s! }),
  [go, spawnId] as const,
);
await page.waitForTimeout(600);
const [wx, wy] = at.split(',').map(Number) as [number, number];
await page.evaluate(([x, y]) => (window as unknown as { __ua: Ua }).__ua.controller.debugTeleport({ x: x!, y: y! }), [
  wx,
  wy,
] as const);
await page.evaluate(() => (window as unknown as { __ua: Ua }).__ua.controller.debugFreeze(true));

const frames: Rgba[] = [];
const notes: string[] = [];
for (let i = 0; i < count; i++) {
  await page.evaluate((d) => (window as unknown as { __ua: Ua }).__ua.controller.debugStep(d), i === 0 ? 0.05 : every);
  await page.waitForTimeout(160);
  const where = await page.evaluate(
    ([id, lx, ly]) => {
      const ua = (window as unknown as { __ua: Ua }).__ua;
      const n = ua.controller.world.npcs.find((x) => x.id === id);
      if (!n) return null;
      // Keep Wildstar beside the grown-up so the camera frames them both.
      ua.controller.debugTeleport({ x: n.pos.x + (lx as number), y: n.pos.y + (ly as number) });
      return { screen: ua.controller.toScreen(n.pos), clip: n.anim.clip, facing: n.anim.facing };
    },
    [npc, leadX, leadY] as const,
  );
  if (!where) throw new Error(`no ${npc} on ${go}`);
  await page.evaluate(() => (window as unknown as { __ua: Ua }).__ua.controller.debugStep(0.04));
  await page.waitForTimeout(160);
  const here = await page.evaluate((id) => {
    const ua = (window as unknown as { __ua: Ua }).__ua;
    const n = ua.controller.world.npcs.find((x) => x.id === id)!;
    return ua.controller.toScreen(n.pos);
  }, npc);
  const x = Math.max(0, Math.min(844 - cropW, here.x - cropW / 2));
  const y = Math.max(0, Math.min(390 - cropH, here.y - cropH * 0.78));
  const png = decodePng(new Uint8Array(await page.screenshot({ clip: { x, y, width: cropW, height: cropH } })));
  frames.push({ width: png.width, height: png.height, data: png.data });
  notes.push(`${where.clip}-${where.facing}`);
}
const sheet = contactSheet(frames, { cols, scale: 1, gap: 4, bg: [10, 10, 20, 255] });
writeFileSync(out, encodePngRgba({ width: sheet.width, height: sheet.height, data: sheet.data }));
console.log(`wrote ${out}`);
console.log(notes.map((n, i) => `${i}:${n}`).join('  '));
await browser.close();
