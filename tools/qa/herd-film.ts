import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { contactSheet, type Rgba } from '../art/core/image';
import { args, flag } from '../lib/args';
import { decodePng, encodePngRgba } from '../lib/png';
import { silence } from './silence';

/**
 * Follows the whole herd in the real game with time frozen and photographs it as it walks, turns
 * back through itself and stops, laid out side by side. The simulation's census says how often
 * unicorns stack or change state; this shows what that looks like on the screen.
 *   tsx tools/qa/herd-film.ts <out.png> [--go palace-garden] [--route dx,dy;dx,dy] [--leg 2.5] [--every 0.25] [--crop 460x230] [--cols 4] [--dpr 1]
 * The route is a list of offsets from where Wildstar stands when each leg starts, each tapped in
 * turn, a leg of `--leg` seconds each. The default walks east, turns back through the herd, and
 * stops.
 */
const out = args[0] ?? 'assets/source/_scratch/herd-film.png';
const go = flag('go', '');
const route = flag('route', '420,0;-420,0')
  .split(';')
  .map((p) => p.split(',').map(Number) as [number, number]);
const leg = Number(flag('leg', '2.5'));
const every = Number(flag('every', '0.25'));
const [cropW, cropH] = flag('crop', '780x300').split('x').map(Number) as [number, number];
const cols = Number(flag('cols', '2'));
const dpr = Number(flag('dpr', '1'));
const url = flag('url', 'http://localhost:5173/?test');

interface Pt {
  x: number;
  y: number;
}
type Ua = {
  controller: {
    world: {
      persistent: { recruited: string[] };
      map: { id: string; encounters: { unicornId: string; home: Pt }[] };
      nav: { freePointNear(c: Pt, avoid: Pt[], gap?: number, max?: number): Pt | null };
      unicorns: Record<string, { pos: Pt; anim: { clip: string; facing: number }; state: { kind: string } }>;
    };
    toScreen(p: Pt): Pt;
    tap(p: Pt): void;
    debugFreeze(on: boolean): void;
    debugStep(s: number): void;
    travel(to: { mapId: string; spawnId: string }): Promise<void>;
    debugTeleport(to: Pt): void;
  };
  wonders: { isOpen: boolean; state: { where: string }; inside?: { stage: { step(seconds: number): void } } };
};
async function recruitEveryone(page: Page): Promise<void> {
  for (const id of ['leaf', 'glacier', 'river', 'cinder', 'storm']) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const at = await page.evaluate((who) => {
        const { world } = (window as unknown as { __ua: Ua }).__ua.controller;
        const e = world.map.encounters.find((x) => x.unicornId === who)!;
        return world.nav.freePointNear({ x: e.home.x - 40, y: e.home.y + 100 }, [], 0, 200);
      }, id);
      if (!at) throw new Error(`no open ground beside ${id}`);
      await page.evaluate((p) => (window as unknown as { __ua: Ua }).__ua.controller.debugTeleport(p), at);
      await page.evaluate(() => (window as unknown as { __ua: Ua }).__ua.controller.debugStep(1.5));
      await page.evaluate((who) => {
        const c = (window as unknown as { __ua: Ua }).__ua.controller;
        const u = c.world.unicorns[who]!;
        c.tap({ x: u.pos.x, y: u.pos.y - 52 });
      }, id);
      await page.evaluate(() => (window as unknown as { __ua: Ua }).__ua.controller.debugStep(14));
      if (
        await page.evaluate(
          (who) => (window as unknown as { __ua: Ua }).__ua.controller.world.persistent.recruited.includes(who),
          id,
        )
      )
        break;
      if (attempt === 3) throw new Error(`${id} would not join`);
    }
  }
}

/**
 * The sixth friend sets off the finale, which covers the world until it has run its course, so it
 * is watched through before the herd is filmed.
 */
async function watchFinale(page: Page): Promise<void> {
  const opened = await page
    .waitForFunction(() => (window as unknown as { __ua: Ua }).__ua.wonders.isOpen, undefined, { timeout: 20_000 })
    .then(
      () => true,
      () => false,
    );
  if (!opened) return;
  await page.waitForFunction(
    () => (window as unknown as { __ua: Ua }).__ua.wonders.state.where !== 'opening',
    undefined,
    { timeout: 20_000 },
  );
  await page.evaluate(() => (window as unknown as { __ua: Ua }).__ua.wonders.inside?.stage.step(12));
  await page.waitForFunction(() => !(window as unknown as { __ua: Ua }).__ua.wonders.isOpen, undefined, {
    timeout: 30_000,
  });
}

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
await page.waitForTimeout(1200);
await page.evaluate(() => (window as unknown as { __ua: Ua }).__ua.controller.debugFreeze(true));
await recruitEveryone(page);
await watchFinale(page);

if (go) {
  const spawnId = go === 'palace-garden' ? 'from-forest' : 'from-garden';
  await page.evaluate(
    ([m, s]) => (window as unknown as { __ua: Ua }).__ua.controller.travel({ mapId: m!, spawnId: s! }),
    [go, spawnId] as const,
  );
  await page.waitForTimeout(900);
  await page.evaluate(() => (window as unknown as { __ua: Ua }).__ua.controller.debugStep(6));
}

const frames: Rgba[] = [];
const notes: string[] = [];
let t = 0;
for (const [dx, dy] of route) {
  await page.evaluate(
    ([ox, oy]) => {
      const c = (window as unknown as { __ua: Ua }).__ua.controller;
      const from = c.world.unicorns.wildstar!.pos;
      c.tap({ x: from.x + ox!, y: from.y + oy! });
    },
    [dx, dy] as const,
  );
  for (let s = 0; s < Math.round(leg / every); s++) {
    await page.evaluate(async (d) => {
      (window as unknown as { __ua: Ua }).__ua.controller.debugStep(d);
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    }, every);
    t += every;
    const look = await page.evaluate(() => {
      const c = (window as unknown as { __ua: Ua }).__ua.controller;
      const lead = c.world.unicorns.wildstar!;
      return {
        screen: c.toScreen(lead.pos),
        states: Object.entries(c.world.unicorns)
          .map(([id, u]) => `${id[0]}:${u.anim.clip[0]}${u.anim.facing}`)
          .join(' '),
      };
    });
    const x = Math.max(0, Math.min(844 - cropW, look.screen.x - cropW / 2));
    const y = Math.max(0, Math.min(390 - cropH, look.screen.y - cropH * 0.7));
    const png = decodePng(new Uint8Array(await page.screenshot({ clip: { x, y, width: cropW, height: cropH } })));
    frames.push({ width: png.width, height: png.height, data: png.data });
    notes.push(`${t.toFixed(2)}s ${look.states}`);
  }
}
const sheet = contactSheet(frames, { cols, scale: 1, gap: 4, bg: [10, 10, 20, 255] });
writeFileSync(out, encodePngRgba({ width: sheet.width, height: sheet.height, data: sheet.data }));
console.log(`wrote ${out}`);
console.log(notes.map((n, i) => `${i}: ${n}`).join('\n'));
await browser.close();
