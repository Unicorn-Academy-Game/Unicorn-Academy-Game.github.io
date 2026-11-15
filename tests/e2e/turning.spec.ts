import { expect, type Page, test } from '@playwright/test';
import { CONFIG } from '../../src/domain/config';
import { footprint } from '../../src/render/shadow';
import { shownFacings } from '../../src/shared/clips';
import {
  angleOf,
  FACING_COUNT,
  FACING_STEP,
  facingAt,
  facingLabel,
  nearestAmong,
  stepsBetween,
  turnWay,
  UNICORN_FACINGS,
  type UnicornFacing,
} from '../../src/shared/compass';
import { facingKey } from '../../src/shared/manifest';
import { freeze, hush, openGame, play, standAt, step, waitForFine, withoutFineSheets } from './helpers';

/** What these tests read of the engine and of the manifest, as far as they read either. */
interface Img {
  texture?: { key: string };
  frame: { name: string };
  flipX: boolean;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}
interface Clip {
  flip?: true;
  page?: number;
  frames: { rect: number }[];
}
interface Pt {
  x: number;
  y: number;
}
interface Asset {
  shadow: { rx: number; ry: number; dx: number; dy: number; a: number };
  clips: Record<string, Record<string, Clip | undefined>>;
  fine?: { clips: Record<string, Record<string, Clip | undefined>> };
}
interface Hooks {
  stage: { scene: { children: { list: Img[] } } };
  manifest: { unicorns: Record<string, Asset> };
  controller: {
    debugStep(seconds: number): void;
    toScreen(p: Pt): Pt;
    lead(css: Pt): void;
    release(): void;
    world: {
      unicorns: Record<string, { pos: Pt; speed: number; anim: { clip: string; facing: number; startedAt: number } }>;
    };
  };
}

/**
 * What was on the screen after one tick of a unicorn being led round: what the world says she is
 * doing, and which picture of her the engine drew.
 */
interface Sample {
  clip: string;
  facing: UnicornFacing;
  texture: string;
  frame: string;
  flipped: boolean;
  speed: number;
  at: Pt;
}

/** One tick of the world, in seconds. */
const TICK = 1 / 30;

/**
 * Where the finger is from her body, in CSS pixels. A unicorn is led toward it from where her body
 * is drawn.
 */
const REACH = 180;

/** A tick or so to get going, which is not turning. */
const WARM = 12;

/**
 * The open ground she needs all round her, in world units. She walks 7 a tick, so a finger that
 * turns 4 degrees a tick leads her on a circle 200 across, which takes her as far as 200 from where
 * she started.
 */
const ROOM = 220;

/**
 * Holds a finger `REACH` from Wildstar's body and turns it about her a few degrees every tick, a
 * tick at a time, drawing each one. She is led round in a circle, as a child would lead her by
 * drawing one with a finger, and what is on the screen is read after every tick.
 */
const lead = (page: Page, from: number, degreesPerTick: number, ticks: number): Promise<Sample[]> =>
  page.evaluate(
    ({ from, degreesPerTick, ticks, reach, tick }) => {
      const ua = window.__ua as unknown as Hooks;
      const wildstar = ua.controller.world.unicorns.wildstar!;
      const samples: Sample[] = [];
      for (let k = 0; k < ticks; k++) {
        const body = ua.controller.toScreen({ x: wildstar.pos.x, y: wildstar.pos.y - 52 });
        const angle = from + (degreesPerTick * k * Math.PI) / 180;
        ua.controller.lead({ x: body.x + reach * Math.cos(angle), y: body.y + reach * Math.sin(angle) });
        ua.controller.debugStep(tick);
        const image = ua.stage.scene.children.list.find((c) => c.texture?.key?.startsWith('unicorn:wildstar'))!;
        samples.push({
          clip: wildstar.anim.clip,
          facing: wildstar.anim.facing as UnicornFacing,
          texture: image.texture!.key,
          frame: image.frame.name,
          flipped: image.flipX,
          speed: wildstar.speed,
          at: { x: Math.round(wildstar.pos.x), y: Math.round(wildstar.pos.y) },
        });
      }
      ua.controller.release();
      return samples;
    },
    { from, degreesPerTick, ticks, reach: REACH, tick: TICK },
  );

/** Where Wildstar is and which way she is turned. */
const wildstarNow = (page: Page): Promise<{ pos: Pt; facing: UnicornFacing }> =>
  page.evaluate(() => {
    const wildstar = (window.__ua as unknown as Hooks).controller.world.unicorns.wildstar!;
    return { pos: { ...wildstar.pos }, facing: wildstar.anim.facing as UnicornFacing };
  });

/**
 * The nearest place to her, with open ground all round it for `ROOM`, where she can be led about
 * without coming up against a tree.
 */
const meadowNear = async (page: Page): Promise<Pt> =>
  page.evaluate(
    ({ near, room }) => {
      const { nav } = window.__ua!.controller.world;
      const open = (c: Pt): boolean => {
        for (let r = 0; r <= room; r += 20) {
          const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 20);
          for (let k = 0; k < n; k++) {
            const a = (k / n) * 2 * Math.PI;
            if (!nav.isWalkable({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }, 8)) return false;
          }
        }
        return true;
      };
      for (let ring = 0; ring <= 1600; ring += 40) {
        const n = ring === 0 ? 1 : Math.ceil((2 * Math.PI * ring) / 40);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * 2 * Math.PI;
          const c = { x: near.x + ring * Math.cos(a), y: near.y + ring * Math.sin(a) };
          if (open(c)) return c;
        }
      }
      throw new Error(`no open ground with room for ${room} all round it, near ${near.x}, ${near.y}`);
    },
    { near: (await wildstarNow(page)).pos, room: ROOM },
  );

const wildstarAsset = (page: Page): Promise<Asset> =>
  page.evaluate(() => (window.__ua as unknown as Hooks).manifest.unicorns.wildstar!);

/**
 * The facing of every picture of her walking that the engine can draw, by the sheet and the frame
 * it is drawn from. A picture turned about says so, so that it is not taken for the one it turns.
 * With the fine sheets in, the facings they have are drawn from them and the rest from the first
 * sheet.
 */
function whichFacing(asset: Asset, fine: boolean): Map<string, UnicornFacing> {
  const which = new Map<string, UnicornFacing>();
  for (const facing of fine ? UNICORN_FACINGS : shownFacings('walk')) {
    const finer = fine ? asset.fine!.clips.walk![facingKey(facing)] : undefined;
    const clip = finer ?? asset.clips.walk![facingKey(facing)]!;
    for (const f of clip.frames) {
      const key = finer
        ? `unicorn:wildstar:${finer.page}|${f.rect}|false`
        : `unicorn:wildstar|${f.rect}|${clip.flip === true}`;
      if (which.has(key)) throw new Error(`a picture of her walking is drawn for two facings: ${key}`);
      which.set(key, facing);
    }
  }
  return which;
}

const pictureFacing = (which: Map<string, UnicornFacing>, s: Sample): UnicornFacing | undefined =>
  which.get(`${s.texture}|${s.frame}|${s.flipped}`);

/**
 * How the facing changed from one tick to the next, in steps of the ring: positive clockwise on the
 * screen.
 */
function change(from: UnicornFacing, to: UnicornFacing): number {
  return stepsBetween(from, to) * turnWay(from, to);
}

/** Where the finger is, as the facing she is being led to. */
const wantedAt = (from: number, degreesPerTick: number, k: number): UnicornFacing =>
  facingAt((from + (degreesPerTick * k * Math.PI) / 180) / FACING_STEP);

/**
 * A finger turned slowly for a circle and a half, and briskly for two circles. She runs on no
 * circle tighter than 40 in radius, a turn of 10 degrees a tick, so briskly is nearly as quick as
 * her course can go.
 */
const RUNS = [
  { name: 'slowly, 4 degrees a tick', degrees: 4, ticks: 135 },
  { name: 'briskly, 9 degrees a tick', degrees: 9, ticks: 80 },
];

/**
 * How many steps of the ring behind the finger she may be, once she is going. A step is 11.25
 * degrees.
 */
const BEHIND = 2;

/**
 * How long she takes to turn right round, in ticks. The rule for turning takes eight for a half
 * turn.
 */
const ABOUT = 10;

test.describe('turning, in the real game', () => {
  test.setTimeout(480_000);

  // A finger leads her round in a circle, a tick at a time. Her picture is the one made for the way
  // she is turned at every tick, and it goes through all 32 ways, a step at a time and never back.
  test('led round in a circle once the fine sheets are in, she is drawn at every facing in turn, from the picture made for it', async ({
    page,
  }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await waitForFine(page, 'wildstar');
    const which = whichFacing(await wildstarAsset(page), true);
    const meadow = await meadowNear(page);

    for (const way of [1, -1]) {
      for (const run of RUNS) {
        const label = `${run.name}, ${way > 0 ? 'clockwise' : 'anticlockwise'}`;
        await standAt(page, meadow);
        await hush(page);
        const start = angleOf((await wildstarNow(page)).facing);
        const samples = await lead(page, start, way * run.degrees, run.ticks);
        const walking = samples.slice(WARM);

        expect(
          walking.flatMap((s, tick) =>
            s.clip === 'walk' ? [] : [{ tick: tick + WARM, clip: s.clip, speed: s.speed, at: s.at }],
          ),
          `${label}: ticks she is not walking`,
        ).toEqual([]);
        // The picture on the screen is the one of the way the world has her turned, at every tick.
        const drawn = walking.map((s) => pictureFacing(which, s));
        expect(
          drawn.flatMap((f, tick) =>
            f === walking[tick]!.facing ? [] : [{ tick, drawn: f, turned: walking[tick]!.facing }],
          ),
          `${label}: pictures that are not hers for the way she is turned`,
        ).toEqual([]);

        // A finger that turns less than a step a tick turns her a step at a time, so no way is left
        // out and none is gone back to.
        const steps = walking.slice(1).map((s, i) => change(walking[i]!.facing, s.facing));
        expect(Math.max(...steps.map(Math.abs)), `${label}: most steps of the ring in one tick`).toBeLessThanOrEqual(1);
        expect(
          steps.filter((n) => n * way < 0),
          `${label}: steps back against the turn`,
        ).toEqual([]);
        expect(new Set(walking.map((s) => s.facing)).size, `${label}: ways she was drawn at`).toBe(FACING_COUNT);

        // She is turned to where the finger is, give or take the steps she is behind it.
        const behind = walking.map((s, tick) =>
          stepsBetween(s.facing, wantedAt(start, way * run.degrees, tick + WARM)),
        );
        expect(Math.max(...behind), `${label}: most steps behind the finger`).toBeLessThanOrEqual(BEHIND);
        expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
      }
    }
    expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
  });

  // A finger put to one side of her while she stands turns her about. She swings round through the
  // ways between, a few steps of the ring a tick, and does not flick.
  test('a finger put on the other side of her turns her round through the ways between, in the way that is shorter', async ({
    page,
  }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await waitForFine(page, 'wildstar');
    const which = whichFacing(await wildstarAsset(page), true);
    const meadow = await meadowNear(page);

    // A quarter of a turn, three eighths of one, and half of one, which has no shorter way round.
    for (const { way, apart } of [
      { way: 1, apart: 8 },
      { way: -1, apart: 8 },
      { way: 1, apart: 12 },
      { way: -1, apart: 12 },
      { way: 1, apart: 16 },
    ]) {
      const label = `${(apart * 360) / FACING_COUNT} degrees ${way > 0 ? 'clockwise' : 'anticlockwise'}`;
      await standAt(page, meadow);
      await hush(page);
      const { facing: from } = await wildstarNow(page);
      const to = facingAt(from + way * apart);
      const samples = await lead(page, angleOf(to), 0, 30);

      expect(
        samples.flatMap((s, tick) => (s.clip === 'walk' ? [] : [{ tick, clip: s.clip, speed: s.speed }])),
        `${label}: ticks she is not walking`,
      ).toEqual([]);
      const drawn = samples.map((s) => pictureFacing(which, s));
      expect(
        drawn.flatMap((f, tick) =>
          f === samples[tick]!.facing ? [] : [{ tick, drawn: f, turned: samples[tick]!.facing }],
        ),
        `${label}: pictures that are not hers for the way she is turned`,
      ).toEqual([]);

      const path = [from, ...samples.map((s) => s.facing)];
      const steps = path.slice(1).map((f, i) => change(path[i]!, f));
      expect(Math.max(...steps.map(Math.abs)), `${label}: most steps of the ring in one tick`).toBeLessThanOrEqual(
        CONFIG.turn.fastest,
      );
      const going = Math.sign(steps.find((n) => n !== 0) ?? 0);
      if (apart < FACING_COUNT / 2) expect(going, `${label}: which way she turns`).toBe(way);
      expect(
        steps.filter((n) => n * going < 0),
        `${label}: steps back`,
      ).toEqual([]);
      const arrived = samples.findIndex((s) => s.facing === to);
      expect(arrived, `${label}: ticks until she faces where the finger is`).toBeGreaterThanOrEqual(0);
      expect(arrived, `${label}: ticks until she faces where the finger is`).toBeLessThanOrEqual(ABOUT);
      expect(
        samples.slice(arrived).every((s) => s.facing === to),
        `${label}: stays facing there`,
      ).toBe(true);
      // She is not snapped round. She is drawn at four or more of the ways on the way.
      expect(new Set(samples.map((s) => s.facing)).size, `${label}: ways she was drawn at`).toBeGreaterThanOrEqual(4);
    }
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
  });

  // Where her first sheet is all she has, the picture is the nearest of the eight, and the way she
  // is turned still goes through all of the 32. Her picture then changes one compass step at a
  // time, in the way she turns, and never goes back.
  test.describe('without the fine sheets', () => {
    test.beforeEach(({ page }) => withoutFineSheets(page));

    test('led round in a circle, she is drawn at the nearest of her eight, a compass step at a time, in the way she turns', async ({
      page,
    }) => {
      await openGame(page);
      await play(page);
      await freeze(page);
      const which = whichFacing(await wildstarAsset(page), false);
      const meadow = await meadowNear(page);

      for (const way of [1, -1]) {
        for (const run of RUNS) {
          const label = `${run.name}, ${way > 0 ? 'clockwise' : 'anticlockwise'}`;
          await standAt(page, meadow);
          await hush(page);
          const start = angleOf((await wildstarNow(page)).facing);
          const walking = (await lead(page, start, way * run.degrees, run.ticks)).slice(WARM);

          expect(
            walking.flatMap((s, tick) =>
              s.clip === 'walk' ? [] : [{ tick: tick + WARM, clip: s.clip, speed: s.speed, at: s.at }],
            ),
            `${label}: ticks she is not walking`,
          ).toEqual([]);
          const drawn = walking.map((s) => pictureFacing(which, s));
          expect(
            drawn.flatMap((f, tick) =>
              f === nearestAmong(shownFacings('walk'), walking[tick]!.facing)
                ? []
                : [{ tick, drawn: f, turned: walking[tick]!.facing }],
            ),
            `${label}: pictures that are not the nearest of her eight to the way she is turned`,
          ).toEqual([]);

          expect(new Set(drawn).size, `${label}: pictures she was drawn with`).toBe(shownFacings('walk').length);
          const moves = drawn.flatMap((f, i) => (i > 0 && f !== drawn[i - 1] ? [change(drawn[i - 1]!, f!)] : []));
          expect(
            moves.filter((n) => Math.abs(n) !== 4 || n * way < 0),
            `${label}: moves of her picture that are not a compass step on`,
          ).toEqual([]);
          // One picture to each eighth of a turn she makes, and not a flicker between two of them.
          expect(moves.length, `${label}: changes of picture`).toBeLessThanOrEqual(
            Math.ceil(((run.ticks - WARM) * run.degrees) / 45) + 1,
          );
        }
      }
      expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
    });
  });

  // The shadow is her shadow facing east, turned the way she is turned, at every one of the 32.
  test('the shadow on the ground under her is the one for the way she is turned', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 1);
    const found = await page.evaluate(
      (facings) => {
        const ua = window.__ua as unknown as Hooks;
        const wildstar = ua.controller.world.unicorns.wildstar!;
        const spec = ua.manifest.unicorns.wildstar!.shadow;
        const rows: { facing: number; scaleX: number; scaleY: number; rotation: number; off: number }[] = [];
        for (const facing of facings) {
          wildstar.speed = 0;
          wildstar.anim = { clip: 'idle', facing, startedAt: 0 };
          ua.controller.debugStep(0);
          const here = { x: wildstar.pos.x + spec.dx, y: wildstar.pos.y + spec.dy };
          const shadows = ua.stage.scene.children.list.filter((c) => c.texture?.key === 'shadow-soft');
          const nearest = shadows.reduce((best, c) =>
            Math.hypot(c.x - here.x, c.y - here.y) < Math.hypot(best.x - here.x, best.y - here.y) ? c : best,
          );
          rows.push({
            facing,
            scaleX: nearest.scaleX,
            scaleY: nearest.scaleY,
            rotation: nearest.rotation,
            off: Math.hypot(nearest.x - here.x, nearest.y - here.y),
          });
        }
        return { spec, rows };
      },
      [...UNICORN_FACINGS],
    );
    for (const row of found.rows) {
      const facing = row.facing as UnicornFacing;
      const want = footprint({ ...found.spec }, angleOf(facing));
      expect(row.off, `${facingLabel(facing)}: how far the shadow is from where it belongs`).toBeLessThan(2);
      expect(row.scaleX * 128, `${facingLabel(facing)}: width`).toBeCloseTo(want.rx * 2, 3);
      expect(row.scaleY * 64, `${facingLabel(facing)}: height`).toBeCloseTo(want.ry * 2, 3);
      expect(row.rotation, `${facingLabel(facing)}: tilt`).toBeCloseTo(want.angle, 6);
    }
    // And it does turn: facing east it is long and flat, and facing south it is nearly as deep as
    // it is wide.
    const aspect = (facing: number): number => {
      const row = found.rows.find((r) => r.facing === facing)!;
      return (row.scaleX * 128) / (row.scaleY * 64);
    };
    expect(aspect(0)).toBeGreaterThan(3);
    expect(aspect(8)).toBeLessThan(1.5);
    expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
  });
});
