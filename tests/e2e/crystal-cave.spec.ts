import { expect, type Page, test } from '@playwright/test';
import { POOL } from '../../src/content/cave';
import { GEM_IDS } from '../../src/content/produce';
import { clusterOf } from '../../src/content/props';
import type { MagicKind } from '../../src/shared/ids';
import { decodePng } from '../../tools/lib/png';
import {
  bodyOf,
  FRIENDS,
  freeze,
  hush,
  mapId,
  newWatch,
  openGame,
  type Pt,
  play,
  SCRATCH,
  shot,
  spotOn,
  standAt,
  step,
  stepUntil,
  stepWatching,
  tapWorld,
  walkThrough,
  watchConsole,
} from './helpers';

/**
 * The crystal cave, under the hill north of Glacier's hollow. Everything here goes through the real
 * pointer path and the real picture: what a child taps, what answers, and what the screen shows of
 * it. The pictures are read from the canvas with the buttons taken off it.
 */

const CAVE = (name: string): string => `crystal-cave/${name}`;
const basket = (page: Page) => page.getByRole('group', { name: /basket/i });

/**
 * Where the picture of a prop is anchored, and the first place a unicorn stands to be beside it.
 */
const placeOf = (page: Page, instanceId: string): Promise<{ pos: Pt; stand: Pt }> =>
  page.evaluate((id) => {
    const i = window.__ua!.controller.world.interactables.get(id)!;
    return { pos: { ...i.pos }, stand: { ...i.approach[0]!.pos } };
  }, instanceId);

type Colour = { r: number; g: number; b: number; n: number };

/**
 * The average colour of a square of the canvas round a point of the world. With `lively` the grey
 * of bare rock and shadow is left out, so what is measured is the crystal and not the stone behind
 * it.
 */
async function colourAround(page: Page, at: Pt, half: number, lively: boolean): Promise<Colour> {
  const size = page.viewportSize()!;
  const screen = await page.evaluate((p) => window.__ua!.controller.toScreen(p), at);
  const x = Math.max(0, Math.min(size.width - 2 * half, Math.round(screen.x - half)));
  const y = Math.max(0, Math.min(size.height - 2 * half, Math.round(screen.y - half)));
  const png = decodePng(
    new Uint8Array(
      await page.screenshot({
        clip: { x, y, width: 2 * half, height: 2 * half },
        style: '#ui { display: none !important }',
      }),
    ),
  );
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [pr, pg, pb] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
    if (lively && Math.max(pr, pg, pb) - Math.min(pr, pg, pb) < 40) continue;
    r += pr;
    g += pg;
    b += pb;
    n++;
  }
  return n === 0 ? { r: 0, g: 0, b: 0, n } : { r: r / n, g: g / n, b: b / n, n };
}

/**
 * How many pixels of a rectangle of the canvas, centred on a point of the world, are greener than
 * they are blue. The floor of the cave is lilac, so a green light lying on it turns it.
 */
async function greener(page: Page, at: Pt, wide: number, high: number): Promise<number> {
  const size = page.viewportSize()!;
  const screen = await page.evaluate((p) => window.__ua!.controller.toScreen(p), at);
  const x = Math.max(0, Math.min(size.width - wide, Math.round(screen.x - wide / 2)));
  const y = Math.max(0, Math.min(size.height - high, Math.round(screen.y - high / 2)));
  const png = decodePng(
    new Uint8Array(
      await page.screenshot({ clip: { x, y, width: wide, height: high }, style: '#ui { display: none !important }' }),
    ),
  );
  let count = 0;
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i + 1]! > png.data[i + 2]! + 8) count++;
  return count;
}

/**
 * Runs the game on until the camera has stopped moving. It follows the leader by easing, and after
 * a long jump a tap lands on what the picture showed a moment before, so a test that taps must wait
 * for it. The pull of the Heart Hall's vista settles the same way.
 */
async function cameraSettled(page: Page): Promise<void> {
  const where = () => page.evaluate(() => window.__ua!.controller.toScreen({ x: 0, y: 0 }));
  let last = await where();
  for (let i = 0; i < 24; i++) {
    await step(page, 0.5);
    const now = await where();
    if (Math.hypot(now.x - last.x, now.y - last.y) < 0.5) return;
    last = now;
  }
  throw new Error('the camera did not come to rest');
}

/** Puts the leader somewhere and waits until the camera is on her. */
async function standHere(page: Page, at: Pt): Promise<void> {
  await standAt(page, at);
  await cameraSettled(page);
}

/**
 * Opens the game and goes into the cave by the way in from the forest, with the friends she has
 * found and nothing else alive in it.
 */
async function inTheCave(page: Page, friends: readonly string[] = []): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate((ids) => {
    const { recruited } = window.__ua!.controller.world.persistent;
    for (const id of ids) if (!recruited.includes(id as never)) recruited.push(id as never);
  }, friends);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'crystal-cave', spawnId: 'from-forest' }));
  await hush(page);
  await cameraSettled(page);
}

/**
 * Whether a unicorn is in a cast that has got to its release frame, which is where a spell happens.
 */
const released = (page: Page, who: string): Promise<boolean> =>
  page.evaluate((id) => {
    const state = window.__ua!.controller.world.unicorns[id as 'leaf']!.state as {
      kind: string;
      cast?: { released: boolean };
    };
    return state.kind === 'casting' && state.cast?.released === true;
  }, who);

/**
 * Has a unicorn cast by a tap on her, the way a child does, and runs on until her spell has been
 * let go. A friend is put beside the leader, a little to the side and a little in front, so that a
 * finger can tell the two apart, and the tap is made before she has time to walk back to her place
 * in the line. The rest of the herd is sent back to where the way in put it down, so that none of
 * it stands under the finger. Wildstar is the leader, so she is already where the leader stands.
 */
async function castBy(page: Page, who: string, beside: Pt): Promise<void> {
  await page.evaluate(
    ({ id, at }) => {
      const { world } = window.__ua!.controller;
      const away = world.map.spawns.find((s) => s.spawnId === 'from-forest')!.points[0]!;
      for (const [other, u] of Object.entries(world.unicorns)) {
        if (other === 'wildstar' || other === id) continue;
        u.pos = { ...away };
        u.prev = { ...away };
      }
      if (id === 'wildstar') return;
      const spot = world.nav.freePointNear({ x: at.x + 80, y: at.y + 14 }, [], 0, 90) ?? at;
      const u = world.unicorns[id as 'leaf']!;
      u.pos = { ...spot };
      u.prev = { ...spot };
    },
    { id: who, at: beside },
  );
  await step(page, 0.02);
  const body = await bodyOf(page, who);
  expect(
    await page.evaluate((p) => window.__ua!.controller.targetAt(p), body),
    `a tap on ${who}'s body is for her`,
  ).toMatchObject({ kind: 'unicorn', id: who });
  await tapWorld(page, body);
  for (let i = 0; i < 40 && !(await released(page, who)); i++) await step(page, 0.1);
  expect(await released(page, who), `${who} lets her spell go`).toBe(true);
}

/**
 * How close to a piece a tap must be able to land for the herd to gather it, with room to spare. A
 * unicorn gathers one from 54 units.
 */
const TAP_REACH = 40;

/**
 * A place on the ground to tap, so that the herd goes to the piece that lies nearest to her, or a
 * step nearer to it. It is the piece itself where a finger can land on it. Where one cannot,
 * because a neighbour's crystals are drawn over it, a unicorn stands over it or the bubble that
 * points the way out hangs over it, it is the nearest place where one can, and the next round goes
 * on from where she stands. A piece that has no such place within `TAP_REACH` of it is passed over,
 * since a tap would walk her to a place that is too far to gather it, and it lies in a pocket
 * between two clusters where only a herd that follows her would gather it. Null when no piece on
 * the floor is one that a tap can walk to.
 */
const toTheNearest = (page: Page): Promise<Pt | null> =>
  page.evaluate((reach) => {
    const c = window.__ua!.controller;
    const lead = c.world.unicorns.wildstar!.pos;
    const { innerWidth: w, innerHeight: h } = window;
    const gap = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
    // Clear of the buttons and the bubbles round the edges of the screen, which take a tap that
    // lands on them.
    const tappable = (p: Pt): boolean => {
      const s = c.toScreen(p);
      return (
        s.x > 60 &&
        s.x < w - 60 &&
        s.y > 40 &&
        s.y < h - 100 &&
        document.elementFromPoint(s.x, s.y) instanceof HTMLCanvasElement &&
        c.targetAt(p).kind === 'ground' &&
        c.world.nav.isWalkable(p)
      );
    };
    for (const piece of c.world.pickups.list.map((p) => p.to).sort((p, q) => gap(p, lead) - gap(q, lead))) {
      let best: Pt | null = null;
      for (let dx = -reach; dx <= reach; dx += 10) {
        for (let dy = -reach; dy <= reach; dy += 10) {
          const p = { x: piece.x + dx, y: piece.y + dy };
          if ((!best || gap(p, piece) < gap(best, piece)) && tappable(p)) best = p;
        }
      }
      if (best && gap(best, piece) <= reach) return best;
    }
    return null;
  }, TAP_REACH);

/**
 * What each prop of the cave is in the middle of that a spell began, by the reaction that began it.
 */
const reacting = (page: Page, reaction: string): Promise<string[]> =>
  page.evaluate((kind) => {
    const { world } = window.__ua!.controller;
    return [...world.transient].filter(([, m]) => m.kind === kind && m.until > world.time).map(([id]) => id);
  }, reaction);

/** The flowers of the witch's beds: the ones that are open now. */
const flowering = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const { persistent } = window.__ua!.controller.world;
    return Object.entries(persistent.props)
      .filter(([id, s]) => id.startsWith('crystal-cave/bed-') && s.state === 'flowering')
      .map(([id]) => id);
  });

test.describe('the crystal cave', () => {
  test.setTimeout(240_000);

  test('is entered by the mouth in the hill, and left by the one in the antechamber', async ({ page }) => {
    const noise = watchConsole(page);
    await openGame(page);
    await play(page);
    await freeze(page);
    await hush(page);
    const watch = newWatch();
    await walkThrough(page, 'crystal-cave', watch);
    expect(await mapId(page)).toBe('crystal-cave');
    await hush(page);
    await stepWatching(page, 3, watch);
    const away = await page.evaluate(() => {
      const { world } = window.__ua!.controller;
      const spawn = world.map.spawns.find((s) => s.spawnId === 'from-forest')!;
      return world.persistent.recruited
        .concat('wildstar' as never)
        .map((id) =>
          Math.min(
            ...spawn.points.map((q) => Math.hypot(world.unicorns[id]!.pos.x - q.x, world.unicorns[id]!.pos.y - q.y)),
          ),
        );
    });
    for (const d of away) expect(d, 'she stands where the way in put her down').toBeLessThan(400);
    await shot(page, `${SCRATCH}/cave-arrive.png`);

    await walkThrough(page, 'forest', watch);
    expect(await mapId(page)).toBe('forest');
    const mouth = await page.evaluate(() => {
      const { world } = window.__ua!.controller;
      const portal = world.map.portals.find((p) => p.to.mapId === 'crystal-cave')!;
      const lead = world.unicorns.wildstar!.pos;
      return Math.hypot(
        lead.x - (portal.bounds.x + portal.bounds.w / 2),
        lead.y - (portal.bounds.y + portal.bounds.h / 2),
      );
    });
    expect(mouth, 'she comes out in front of the mouth she went in by').toBeLessThan(600);
    await shot(page, `${SCRATCH}/cave-mouth.png`);
    expect(watch.problems).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('lets a gem be gathered from its cluster, and puts the gems in the basket, the rainbow one too', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await inTheCave(page);
    await expect(basket(page)).toBeHidden();
    /**
     * Taps a cluster, runs on until what it let fall has landed, and says what that was. Only the
     * pieces of this tap are counted.
     */
    const dropFrom = async (id: string): Promise<string[]> => {
      const made = await page.evaluate(() => window.__ua!.controller.world.pickups.made);
      await tapWorld(page, await spotOn(page, id));
      for (
        let waited = 0;
        waited < 10 && (await page.evaluate(() => window.__ua!.controller.world.pickups.made)) === made;
        waited++
      )
        await step(page, 1);
      await step(page, 1);
      return page.evaluate(
        (first) =>
          window
            .__ua!.controller.world.pickups.list.filter((p) => Number(p.id.slice('pickup-'.length)) > first)
            .map((p) => p.produce),
        made,
      );
    };
    const onTheFloor = (): Promise<number> => page.evaluate(() => window.__ua!.controller.world.pickups.list.length);
    for (const gem of ['ruby', 'rainbow', 'onyx'] as const) {
      const id = CAVE(`${clusterOf(gem)}-1`);
      const { stand } = await placeOf(page, id);
      // What a pocket kept of the last gem is swept up, so that each gem is judged by what it
      // dropped itself.
      await page.evaluate(() => (window.__ua!.controller.world.pickups.list.length = 0));
      await standHere(page, stand);
      const fell = await dropFrom(id);
      expect(fell.length, `${id} lets two or three fall`).toBeGreaterThanOrEqual(2);
      expect(new Set(fell), `what ${id} gave`).toEqual(new Set([gem]));
      if (gem === 'rainbow') await shot(page, `${SCRATCH}/cave-gems-falling.png`);
      // A piece can land in a pocket between two clusters, where a tap walks her to a place too far
      // to gather it. A cluster is never used up, so she taps it again.
      for (let again = 0; again < 4 && !(await toTheNearest(page)); again++)
        expect(new Set(await dropFrom(id)), `what ${id} gave again`).toEqual(new Set([gem]));
      // She gathers them by walking to them, a tap on the ground at a time.
      for (let rounds = 0; rounds < 12; rounds++) {
        const to = await toTheNearest(page);
        if (!to) break;
        const left = await onTheFloor();
        await tapWorld(page, to);
        for (let waited = 0; waited < 10 && (await onTheFloor()) >= left; waited++) {
          await step(page, 1);
          if (waited > 0 && (await page.evaluate(() => window.__ua!.controller.world.unicorns.wildstar!.speed === 0)))
            break;
        }
      }
      expect(await toTheNearest(page), `every ${gem} that a tap can walk to is gathered`).toBeNull();
      await expect(basket(page)).toBeVisible();
      await expect(page.locator(`.basket-chip[data-produce="${gem}"]`)).toBeVisible();
    }
    await shot(page, `${SCRATCH}/cave-basket.png`);
    const held = await page.evaluate(() =>
      [...document.querySelectorAll('.basket-chip')].map((c) => (c as HTMLElement).dataset.produce),
    );
    expect(new Set(held)).toEqual(new Set(['ruby', 'rainbow', 'onyx']));
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('has two clusters of every gem in the grotto, and each can be tapped where it is drawn', async ({ page }) => {
    await inTheCave(page);
    for (const gem of GEM_IDS) {
      for (const n of [1, 2]) {
        const id = CAVE(`${clusterOf(gem)}-${n}`);
        const { stand } = await placeOf(page, id);
        await standHere(page, stand);
        // `spotOn` finds a place on it where a finger lands on it and on nothing in front of it,
        // and says so if there is none.
        await spotOn(page, id);
      }
    }
    await shot(page, `${SCRATCH}/cave-grotto.png`);
  });

  test("turns the Heart Crystal the colour of each friend's magic when she is tapped, and gives the rainbow back", async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await inTheCave(page, FRIENDS);
    const heart = await placeOf(page, CAVE('heart-1'));
    await standHere(page, heart.stand);
    // The middle of the crystal, above the dais it stands on.
    const crystal = { x: heart.pos.x, y: heart.pos.y - 150 };
    const SHOWS: Record<MagicKind, { who: string; shows: (c: Colour) => boolean }> = {
      light: { who: 'wildstar', shows: (c) => c.r >= c.g && c.g > c.b },
      nature: { who: 'leaf', shows: (c) => c.g > c.r && c.g > c.b },
      ice: { who: 'glacier', shows: (c) => c.r < c.g && c.r < c.b },
      water: { who: 'river', shows: (c) => c.b > c.g && c.g > c.r },
      fire: { who: 'cinder', shows: (c) => c.r > c.g && c.g > c.b },
      lightning: { who: 'storm', shows: (c) => c.b > c.r && c.r > c.g },
    };
    for (const [magic, { who, shows }] of Object.entries(SHOWS) as [MagicKind, (typeof SHOWS)[MagicKind]][]) {
      await castBy(page, who, heart.stand);
      await step(page, 1.2);
      expect(await reacting(page, `heart-${magic}`), `${who}'s ${magic} reaches the crystal`).toEqual([
        CAVE('heart-1'),
      ]);
      const seen = await colourAround(page, crystal, 18, true);
      expect(seen.n, `${magic}: the crystal is drawn`).toBeGreaterThan(40);
      expect(shows(seen), `${magic}: the crystal shows her colour (${JSON.stringify(seen)})`).toBe(true);
      await step(page, 9);
      expect(await reacting(page, `heart-${magic}`), 'the crystal goes back to the rainbow').toEqual([]);
    }
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('wakes the sleeping crystals, charges a pillar, rings the chimes, stokes the cauldron and opens a bed, each for the right friend', async ({
    page,
  }) => {
    await inTheCave(page, FRIENDS);
    const cases: { at: string; who: string; reaction: string }[] = [
      { at: 'sleepers-5', who: 'river', reaction: 'wake-water' },
      { at: 'sleepers-6', who: 'cinder', reaction: 'wake-fire' },
      { at: 'pillar-1', who: 'storm', reaction: 'charge-pillar' },
      { at: 'chimes-1', who: 'storm', reaction: 'ring-chimes' },
      { at: 'cauldron-1', who: 'cinder', reaction: 'stoke-cauldron' },
      { at: 'pool-1', who: 'river', reaction: 'ripple-pool' },
    ];
    for (const { at, who, reaction } of cases) {
      const { stand } = await placeOf(page, CAVE(at));
      await standHere(page, stand);
      await castBy(page, who, stand);
      await step(page, 0.4);
      expect((await reacting(page, reaction)).length, `${who} at ${at} gets ${reaction}`).toBeGreaterThan(0);
      await shot(page, `${SCRATCH}/cave-${reaction}.png`);
      await step(page, 11);
      expect(await reacting(page, reaction), `${reaction} ends by itself`).toEqual([]);
    }
    const bed = await placeOf(page, CAVE('bed-1'));
    await standHere(page, bed.stand);
    expect(await flowering(page)).toEqual([]);
    await castBy(page, 'leaf', bed.stand);
    await step(page, 0.5);
    expect((await flowering(page)).length, 'Leaf opens a bed to flowers').toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/cave-bloom-bed.png`);
    await step(page, 11);
    expect(await flowering(page), 'the flowers close again by themselves').toEqual([]);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test("shows the pool under a sheet of ice while Glacier's cold is on it, and thaws it by itself", async ({
    page,
  }) => {
    await inTheCave(page, FRIENDS);
    const pool = await placeOf(page, CAVE('pool-1'));
    // A little in front of the middle of the pool, where the sheet of ice is on the screen of a
    // phone for a herd on the shore.
    const middle = { x: pool.pos.x, y: pool.pos.y - POOL.pointRise + 60 };
    await standHere(page, pool.stand);
    const water = await colourAround(page, middle, 36, false);
    await castBy(page, 'glacier', pool.stand);
    await step(page, 1.8);
    expect(await reacting(page, 'freeze-pool')).toEqual([CAVE('pool-1')]);
    const ice = await colourAround(page, middle, 36, false);
    await shot(page, `${SCRATCH}/cave-pool-ice.png`);
    expect(
      ice.r,
      `the ice is paler than the water, so it has more red in it (${JSON.stringify({ water, ice })})`,
    ).toBeGreaterThan(water.r + 25);
    await step(page, 10);
    expect(await reacting(page, 'freeze-pool')).toEqual([]);
    const thawed = await colourAround(page, middle, 36, false);
    expect(thawed.r, `the water is back (${JSON.stringify({ water, ice, thawed })})`).toBeLessThan(ice.r - 20);
  });

  test('opens the door of the hut when she touches it, and lights the floor in front of it', async ({ page }) => {
    await inTheCave(page);
    const door = await placeOf(page, CAVE('hut-door-1'));
    await standHere(page, door.stand);
    const lit = { x: door.pos.x, y: door.pos.y + 20 };
    const closed = await greener(page, lit, 130, 150);
    await tapWorld(page, await spotOn(page, CAVE('hut-door-1')));
    await stepUntil(
      page,
      'the door to start to open',
      () => window.__ua!.controller.world.transient.get('crystal-cave/hut-door-1')?.kind === 'delight',
      12,
    );
    await step(page, 1.2);
    const open = await greener(page, lit, 130, 150);
    await shot(page, `${SCRATCH}/cave-door-open.png`);
    expect(open, `the open door lights the floor and the doorway (${closed} then ${open})`).toBeGreaterThan(
      closed + 400,
    );
    await step(page, 4);
    expect(
      await page.evaluate(() => window.__ua!.controller.world.transient.get('crystal-cave/hut-door-1')),
    ).toBeUndefined();
    expect(await greener(page, lit, 130, 150), 'the door is shut and the floor is dark again').toBeLessThan(open - 200);
  });

  test('keeps its summer when it is winter outside, and the snow is back when she walks out', async ({ page }) => {
    await openGame(page, 'kept', '&season=winter');
    await play(page);
    await freeze(page);
    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'crystal-cave', spawnId: 'from-forest' }));
    await step(page, 1);
    expect(await page.evaluate(() => window.__ua!.controller.seasonShown)).toBe('summer');
    expect(await page.evaluate(() => window.__ua!.controller.debugWeather())).toEqual({ fall: null, visible: 0 });
    const drawnFrom = (key: string) =>
      page.evaluate((k) => {
        const textures = window.__ua!.stage.game.textures as unknown as {
          list: Record<string, { source: { source: unknown }[] } | undefined>;
        };
        const picture = textures.list[k]?.source[0]?.source;
        return picture instanceof HTMLCanvasElement
          ? 'painted'
          : picture instanceof HTMLImageElement
            ? 'as it came'
            : 'missing';
      }, key);
    expect(await drawnFrom('bundle:cave:0')).toBe('as it came');
    expect(await drawnFrom('tiles:crystal-cave')).toBe('as it came');

    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'forest', spawnId: 'from-cave' }));
    await step(page, 1);
    expect(await page.evaluate(() => window.__ua!.controller.seasonShown)).toBe('winter');
    expect((await page.evaluate(() => window.__ua!.controller.debugWeather())).fall).toBe('snow');
    await shot(page, `${SCRATCH}/cave-mouth-winter.png`);
  });
});
