import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { clamp } from '../../src/shared/math';
import { blit, createRgba, type Rgba } from '../art/core/image';
import { decodePng, encodePngRgba } from '../lib/png';
import { ORIGIN } from './origin';
import { silence } from './silence';

/**
 * Photographs the game for the README and the art bible. A test address (`?test`) is in summer, so
 * the same code gives the same pictures.
 *   tsx tools/qa/media.ts [outdir]      (needs the development server, and writes to docs/media unless told otherwise)
 */
const out = process.argv[2] ?? 'docs/media';
const SIZE = { width: 800, height: 450 };
const FRIENDS = ['leaf', 'glacier', 'river', 'cinder', 'storm'];
const SPELLS = ['light-burst', 'leaf-burst', 'ice-burst', 'water-burst', 'fire-burst', 'lightning-burst'];
/**
 * How long the game runs on between one look at a spell and the next. A spell is at its fullest at
 * a different moment each, so every one is looked at all along and the fullest look is kept.
 */
const LOOKS = [0.2, 0.2, 0.25, 0.25, 0.3, 0.4, 0.5];
const CELL = { width: 400, height: 225 };

interface Pt {
  x: number;
  y: number;
}
interface Ua {
  settings: {
    get(): { learning: object };
    update(patch: { learning?: object; zoom?: number }): void;
    flush(): Promise<void>;
  };
  wonders: { isOpen: boolean; state: { where: string }; inside?: { stage: { step(seconds: number): void } } };
  controller: {
    phase: string;
    compiled: { render: { vista?: { stand: Pt } } };
    world: {
      persistent: { recruited: string[] };
      life: { critters: unknown[] };
      nav: { freePointNear(c: Pt, avoid: Pt[], gap?: number, max?: number): Pt | null };
      unicorns: Record<string, { pos: Pt }>;
    };
    toScreen(p: Pt): Pt;
    tap(p: Pt): void;
    targetAt(p: Pt): { kind: string; id?: string };
    toggleSurvey(): void;
    debugStep(seconds: number): void;
    debugTeleport(to: Pt): void;
    debugEffect(id: string, at: Pt, seconds: number, facing: string): void;
    travel(to: { mapId: string; spawnId: string }): Promise<void>;
  };
}
/**
 * The game's handle in the page. The init script below puts it there, because a function given to
 * the page runs in the page and can see none of this file.
 */
declare const ua: () => Ua;
const step = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => ua().controller.debugStep(s), seconds);

/** How big everything looks, the way the Zoom choice in the controls sets it. */
async function zoom(page: Page, value: number): Promise<void> {
  await page.evaluate(async (z) => {
    const { settings } = ua();
    settings.update({ zoom: z });
    await settings.flush();
  }, value);
  await step(page, 1);
}

/** The open ground nearest to a spot. */
async function openGroundNear(page: Page, spot: Pt): Promise<Pt> {
  const at = await page.evaluate((p) => ua().controller.world.nav.freePointNear(p, [], 0, 500), spot);
  if (!at) throw new Error(`no open ground near ${spot.x}, ${spot.y}`);
  return at;
}

/**
 * Puts Wildstar on the open ground nearest to a spot, and lets the camera and the herd settle
 * there.
 */
async function standNear(page: Page, spot: Pt): Promise<void> {
  const at = await openGroundNear(page, spot);
  await page.evaluate((p) => ua().controller.debugTeleport(p), at);
  await step(page, 1.5);
}

const leaderAt = (page: Page): Promise<Pt> =>
  page.evaluate(() => ({ ...ua().controller.world.unicorns.wildstar!.pos }));
const tap = (page: Page, at: Pt): Promise<void> => page.evaluate((p) => ua().controller.tap(p), at);

/**
 * Walks Wildstar up to a friend and taps them where a finger would land on them, the way a child
 * does, until they have joined.
 */
async function recruit(page: Page, who: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const friend = await page.evaluate((id) => ({ ...ua().controller.world.unicorns[id]!.pos }), who);
    await standNear(page, { x: friend.x - 40, y: friend.y + 100 });
    await page.evaluate((id) => {
      const c = ua().controller;
      const u = c.world.unicorns[id]!.pos;
      const spots = [52, 40, 28, 16].map((rise) => ({ x: u.x, y: u.y - rise }));
      c.tap(spots.find((p) => c.targetAt(p).id === id) ?? spots[0]!);
    }, who);
    await step(page, 14);
    if (await page.evaluate((id) => ua().controller.world.persistent.recruited.includes(id), who)) return;
  }
  throw new Error(`${who} would not join`);
}

/**
 * The last friend brings a party, a scene that takes the screen a moment after. It is run to its
 * end, and the world is given back.
 */
async function sitOutParty(page: Page): Promise<void> {
  await page.waitForFunction(() => ua().wonders.isOpen, undefined, { timeout: 30_000 });
  await page.waitForFunction(() => ua().wonders.state.where !== 'opening', undefined, { timeout: 30_000 });
  await page.evaluate(() => ua().wonders.inside?.stage.step(12));
  await page.waitForFunction(() => !ua().wonders.isOpen && ua().controller.phase === 'playing', undefined, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
}

/**
 * A picture of the page around a point in the world, as large as one cell of the sheet, kept inside
 * the screen.
 */
async function cellAround(page: Page, world: Pt): Promise<Rgba> {
  const at = await page.evaluate((p) => ua().controller.toScreen(p), world);
  const clip = {
    x: clamp(at.x - CELL.width / 2, 0, SIZE.width - CELL.width),
    y: clamp(at.y - CELL.height / 2, 0, SIZE.height - CELL.height),
    ...CELL,
  };
  return decodePng(new Uint8Array(await page.screenshot({ clip })));
}

/** How many pixels of a picture are not what they were in another one of the same size. */
function changed(a: Rgba, b: Rgba): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i]! - b.data[i]!),
      Math.abs(a.data[i + 1]! - b.data[i + 1]!),
      Math.abs(a.data[i + 2]! - b.data[i + 2]!),
    );
    if (d > 40) n++;
  }
  return n;
}

/**
 * The six spells on a sheet, each at the moment it shows most, cast where Wildstar stands. Nothing
 * else moves in them, and the interface is put away.
 */
async function spellSheet(page: Page): Promise<Uint8Array> {
  await page.evaluate(() => {
    ua().controller.world.life.critters.length = 0;
    document.getElementById('ui')!.style.display = 'none';
  });
  await step(page, 3);
  const shots: Rgba[] = [];
  for (const effect of SPELLS) {
    const w = await leaderAt(page);
    const look = { x: w.x + 40, y: w.y - 30 };
    const before = await cellAround(page, look);
    await page.evaluate(([id, at]) => ua().controller.debugEffect(id, at, 2.4, 'east'), [
      effect,
      { x: w.x + 110, y: w.y },
    ] as const);
    let best = before;
    let most = -1;
    for (const run of LOOKS) {
      await step(page, run);
      const now = await cellAround(page, look);
      const n = changed(before, now);
      if (n > most) [best, most] = [now, n];
    }
    console.log(`${effect}: ${most} pixels`);
    shots.push(best);
    await step(page, 3);
  }
  await page.evaluate(() => (document.getElementById('ui')!.style.display = ''));
  const sheet = createRgba(CELL.width * 2 * 3, CELL.height * 2 * 2, [14, 28, 22, 255]);
  shots.forEach((shot, i) => {
    blit(sheet, shot, (i % 3) * shot.width, Math.floor(i / 3) * shot.height);
  });
  return encodePngRgba(sheet);
}

function save(name: string, bytes: Uint8Array): void {
  writeFileSync(join(out, name), bytes);
  console.log(`wrote ${join(out, name)} (${Math.round(bytes.length / 1024)} KiB)`);
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2, hasTouch: true });
await silence(context);
await context.addInitScript(() => {
  (window as unknown as { ua: () => unknown }).ua = () => (window as unknown as { __ua: unknown }).__ua;
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

await page.goto(`${ORIGIN}/?test`);
await page.waitForFunction(() => (window as unknown as { __ua?: unknown }).__ua !== undefined, undefined, {
  timeout: 120_000,
});
await page.waitForTimeout(2500);
save('title.png', await page.screenshot());

// The title keeps the lessons on, as a new player finds it. The pictures of play are taken without
// them, so that no card is in the way of the herd.
await page.evaluate(async () => {
  const { settings } = ua();
  settings.update({ learning: { ...settings.get().learning, on: false } });
  await settings.flush();
});
await page.getByRole('button', { name: 'Play' }).click({ force: true });
await page.waitForTimeout(1500);

// Leaf joins first, and the two of them walk on to the pond, a little closer than a child usually
// has it.
await recruit(page, 'leaf');
await zoom(page, 1.5);
const home = await leaderAt(page);
const pond = await openGroundNear(page, { x: home.x + 40, y: home.y - 380 });
await standNear(page, home);
await tap(page, pond);
await step(page, 5);
await page.waitForTimeout(600);
save('forest-herd.png', await page.screenshot());

await zoom(page, 1.25);
save('spells.png', await spellSheet(page));
await zoom(page, 1);

// The rest of the herd, and then the palace with all six of them in front of it.
for (const friend of FRIENDS.slice(1)) await recruit(page, friend);
await sitOutParty(page);
await page.evaluate(() => ua().controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
await page.waitForTimeout(1500);
const stand = await page.evaluate(() => ({ ...ua().controller.compiled.render.vista!.stand }));
await standNear(page, { x: stand.x, y: stand.y + 330 });
await tap(page, stand);
await step(page, 8);
await page.waitForTimeout(800);
save('palace-garden.png', await page.screenshot());

// The button by the door stands the camera back to see all of the palace.
await page.evaluate(() => ua().controller.toggleSurvey());
await step(page, 3);
await page.waitForTimeout(800);
save('palace-wide.png', await page.screenshot());
await browser.close();
