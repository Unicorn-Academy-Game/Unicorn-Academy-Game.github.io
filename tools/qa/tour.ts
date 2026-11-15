import { chromium } from '@playwright/test';
import { blit, createRgba, crop, type Rgba, writePng } from '../art/core/image';
import { args, flag } from '../lib/args';
import { decodePng } from '../lib/png';
import { ORIGIN } from './origin';
import { silence } from './silence';

/**
 * Photographs a whole map one screen at a time and lays the screens side by side into one picture
 * of the ground, so a map can be judged as a place and not a corner at a time. Nobody walks: the
 * camera is sent to each spot and the herd stays where it stands. The game must be running on the
 * dev server.
 *   tsx tools/qa/tour.ts <map> <out.png> [--w 863] [--h 360] [--down 4] [--zoom-to x,y,w,h] [--season name]
 * `--season` shows the map in that season (a test page is summer unless told). `--down` shrinks the
 * whole picture by a whole number so it fits on a screen. `--zoom-to` also writes a full size crop
 * of that world area beside the overview, as <out>-crop.png.
 */
const [mapId, out] = args;
if (!mapId || !out)
  throw new Error('usage: tour.ts <map> <out.png> [--w 863] [--h 360] [--down 4] [--zoom-to x,y,w,h] [--season name]');
const width = Number(flag('w', '863'));
const height = Number(flag('h', '360'));
const down = Number(flag('down', '4'));
const zoomTo = flag('zoom-to', '');
const season = flag('season', '');

interface Hooks {
  controller: {
    world: { map: { widthTiles: number; heightTiles: number } };
    debugFreeze(on: boolean): void;
    debugStep(seconds: number): void;
    debugLook(at: { x: number; y: number } | null): void;
    travel(to: { mapId: string; spawnId: string }): Promise<void>;
    toScreen(p: { x: number; y: number }): { x: number; y: number };
  };
}
/**
 * A function sent to the page cannot see this file, so each one reaches for the game's test hooks
 * through this cast.
 */
type Where = { __ua: Hooks };

/**
 * A box filter by a whole number, so the overview is a fair average and not a scatter of picked
 * pixels.
 */
function shrink(src: Rgba, k: number): Rgba {
  const out = createRgba(Math.floor(src.width / k), Math.floor(src.height / k));
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const sum = [0, 0, 0, 0];
      for (let dy = 0; dy < k; dy++) {
        for (let dx = 0; dx < k; dx++) {
          const si = ((y * k + dy) * src.width + x * k + dx) * 4;
          for (let c = 0; c < 4; c++) sum[c]! += src.data[si + c]!;
        }
      }
      const di = (y * out.width + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = Math.round(sum[c]! / (k * k));
    }
  }
  return out;
}

/** Where the herd comes in on a map that is not entered from the garden. */
const ARRIVES: Record<string, string> = {
  'palace-garden': 'from-forest',
  'crystal-cave': 'from-forest',
  'manor-hall': 'from-forest',
  'manor-upper': 'from-lift',
  'palace-dining': 'from-hall',
  'palace-gallery': 'from-hall',
  'palace-tea': 'from-dining',
  'palace-flowers': 'from-dining',
  'palace-bedroom': 'from-tea',
  'palace-library': 'from-gallery',
  'palace-music': 'from-gallery',
  'palace-ballroom': 'from-music',
  'palace-jewel': 'from-library',
  'dance-floor': 'from-party',
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true });
await silence(context);
const page = await context.newPage();
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`${ORIGIN}/?test${season ? `&season=${season}` : ''}`);
await page.waitForFunction(() => (window as unknown as Partial<Where>).__ua !== undefined, undefined, {
  timeout: 120_000,
});
await page.getByRole('button', { name: 'Play' }).click({ force: true });
await page.waitForFunction(
  () => ((window as unknown as Where).__ua.controller as unknown as { phase: string }).phase === 'playing',
  undefined,
  { timeout: 30_000 },
);
await page.addStyleTag({ content: '#ui { display: none !important }' });
await page.evaluate(() => (window as unknown as Where).__ua.controller.debugFreeze(true));
if (mapId !== 'forest') {
  const spawnId = ARRIVES[mapId] ?? 'from-garden';
  await page.evaluate(([m, s]) => (window as unknown as Where).__ua.controller.travel({ mapId: m!, spawnId: s! }), [
    mapId,
    spawnId,
  ] as const);
  await page.waitForTimeout(600);
}

const tiles = await page.evaluate(() => (window as unknown as Where).__ua.controller.world.map);
const W = tiles.widthTiles * 64;
const H = tiles.heightTiles * 64;
const probe = await page.evaluate(() => {
  const c = (window as unknown as Where).__ua.controller;
  c.debugLook({ x: 500, y: 500 });
  const a = c.toScreen({ x: 0, y: 0 });
  const b = c.toScreen({ x: 100, y: 0 });
  return { perUnit: (b.x - a.x) / 100 };
});
const k = probe.perUnit;
const viewW = width / k;
const viewH = height / k;
const stepX = viewW * 0.9;
const stepY = viewH * 0.9;
const mosaic = createRgba(Math.ceil(W * k), Math.ceil(H * k), [255, 0, 255, 255]);
console.log(
  `${mapId}: ${W}x${H} units, ${k.toFixed(3)} px per unit, one screen shows ${Math.round(viewW)}x${Math.round(viewH)}`,
);

const xs: number[] = [];
for (let x = viewW / 2; ; x += stepX) {
  xs.push(Math.min(x, W - viewW / 2));
  if (x >= W - viewW / 2) break;
}
const ys: number[] = [];
for (let y = viewH / 2; ; y += stepY) {
  ys.push(Math.min(y, H - viewH / 2));
  if (y >= H - viewH / 2) break;
}

for (const cy of ys) {
  for (const cx of xs) {
    const origin = await page.evaluate(
      async ([x, y]) => {
        const c = (window as unknown as Where).__ua.controller;
        c.debugLook({ x: x!, y: y! });
        c.debugStep(0.5);
        await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
        return c.toScreen({ x: 0, y: 0 });
      },
      [cx, cy] as const,
    );
    const shot = decodePng(new Uint8Array(await page.screenshot()));
    blit(mosaic, shot, Math.round(-origin.x), Math.round(-origin.y));
  }
  process.stdout.write('.');
}
console.log('');
await browser.close();

writePng(out, down > 1 ? shrink(mosaic, down) : mosaic);
console.log(`wrote ${out}`);
if (zoomTo) {
  const [x, y, w, h] = zoomTo.split(',').map(Number) as [number, number, number, number];
  writePng(
    out.replace(/\.png$/, '-crop.png'),
    crop(mosaic, Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)),
  );
}
