import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { ARCH_TOP, HORN_TIPS } from '../../src/content/fountain-horns';
import { RAINBOW } from '../../src/content/fountain-rainbow';
import {
  bodyOf,
  freeze,
  hush,
  openGame,
  type Pt,
  play,
  SCRATCH,
  shot,
  standAt,
  step,
  tapWorld,
  watchConsole,
} from './helpers';

/**
 * The piece of the rainbow whose transient says how far along it is. The others start, grow and end
 * with it.
 */
const HOST = 'palace-garden/rainbow-outer-0';
/**
 * The places the court is played from: at the foot of each statue, in front of the basin and at the
 * two cups. The cups are not places to stand, and a herd put at one is pushed a little south of it.
 */
const STAND_SPOTS: Record<string, Pt> = {
  'the west statue': { x: 2110, y: 1680 },
  'the east statue': { x: 2690, y: 1680 },
  'the basin': { x: 2400, y: 1670 },
  'the west cup': { x: 2250, y: 1670 },
  'the east cup': { x: 2550, y: 1670 },
};
/**
 * Places from which her light finds no rainbow, because they are further than its reach from every
 * pad: well south of the fountain on the lawn, and well to the west in the garden.
 */
const FAR_SPOTS: Pt[] = [
  { x: 2400, y: 2500 },
  { x: 1100, y: 1500 },
];
/** World units of room asked for above the arch and beside the horns. */
const MARGIN = 24;
const INTO_ITS_FADE = RAINBOW.life - RAINBOW.fade + 0.4;

const ageOf = (page: Page): Promise<number | null> =>
  page.evaluate((id) => {
    const { world } = window.__ua!.controller;
    const up = world.transient.get(id);
    return up ? world.time - up.since : null;
  }, HOST);

/**
 * When the rainbow began and when it ends, in game time, by every piece of it that is up. All of
 * them should say the same.
 */
const lives = (page: Page) =>
  page.evaluate(() => {
    const pieces = [...window.__ua!.controller.world.transient.values()].filter((up) => up.kind === 'light-rainbow');
    return {
      pieces: pieces.length,
      since: [...new Set(pieces.map((up) => up.since))],
      until: [...new Set(pieces.map((up) => up.until))],
    };
  });

/**
 * Where the parts of the rainbow and the leader are on the screen in CSS pixels, and how many of
 * those a world unit is.
 */
const marks = (page: Page) =>
  page.evaluate(
    ({ id, tips, top }) => {
      const { controller } = window.__ua!;
      const host = controller.world.interactables.get(id)!.pos;
      const at = (p: Pt): Pt => controller.toScreen(p);
      const herd = controller.world.unicorns.wildstar!.pos;
      return {
        unit: (at({ x: 1100, y: 1000 }).x - at({ x: 1000, y: 1000 }).x) / 100,
        horns: tips.map((tip) => at({ x: host.x + tip.x, y: host.y + tip.y })),
        top: at({ x: host.x, y: host.y - top }),
        feet: at(herd),
        body: at({ x: herd.x, y: herd.y - 52 }),
        herd,
      };
    },
    { id: HOST, tips: [HORN_TIPS.left, HORN_TIPS.right], top: ARCH_TOP },
  );

/**
 * Whether Wildstar is in a cast that has got to its release frame, which is where a spell happens.
 */
const released = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const state = window.__ua!.controller.world.unicorns.wildstar!.state as {
      kind: string;
      cast?: { released: boolean };
    };
    return state.kind === 'casting' && state.cast?.released === true;
  });

/**
 * Puts the herd at `spot` and has Wildstar cast her light by a tap on her, the way a child does.
 * Says whether her cast got to its release frame, where the spell happens, and how far into its
 * life the rainbow is if one came up.
 */
async function castFrom(page: Page, spot: Pt): Promise<{ released: boolean; age: number | null }> {
  await standAt(page, spot);
  await tapWorld(page, await bodyOf(page, 'wildstar'));
  let letGo = false;
  let age = await ageOf(page);
  for (let i = 0; i < 40 && age === null; i++) {
    await step(page, 0.1);
    letGo ||= await released(page);
    age = await ageOf(page);
  }
  return { released: letGo, age };
}

/** Runs the game on to `target` seconds into the life of the rainbow. */
async function until(page: Page, target: number): Promise<void> {
  await step(page, Math.max(0, target - (await ageOf(page))!));
}

async function untilOver(page: Page): Promise<void> {
  for (let i = 0; i < 12 && (await ageOf(page)) !== null; i++) await step(page, 1);
  expect(await ageOf(page), 'the rainbow is over').toBeNull();
}

async function inTheGarden(page: Page, info: TestInfo): Promise<void> {
  // The window of the phone projects is shorter than any phone the game is held on. This is the
  // size the rainbow is made to be seen whole on.
  if (info.project.use.isMobile) await page.setViewportSize({ width: 915, height: 412 });
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
  await hush(page);
}

test.describe('the rainbow over the palace garden fountain', () => {
  test('comes up from each of the five places the court is played from, with the whole arch and the leader in view', async ({
    page,
  }, info) => {
    test.setTimeout(900_000);
    const noise = watchConsole(page);
    await inTheGarden(page, info);
    const size = page.viewportSize()!;
    for (const [name, spot] of Object.entries(STAND_SPOTS)) {
      const cast = await castFrom(page, spot);
      expect(cast.released, `her cast let go of the spell at ${name}`).toBe(true);
      expect(cast.age, `her light made a rainbow at ${name}`).not.toBeNull();
      // The camera has made all its room a second into the life of the rainbow, and keeps it until
      // the fade.
      for (const target of [1.5, 3.5]) {
        await until(page, target);
        const at = await marks(page);
        const room = MARGIN * at.unit;
        const where = `${name} at ${target} s on ${size.width} by ${size.height}`;
        expect(at.top.y, `the top of the arch from ${where}`).toBeGreaterThanOrEqual(room - 1);
        for (const horn of at.horns) {
          expect(horn.x, `a horn from ${where}`).toBeGreaterThanOrEqual(room - 1);
          expect(horn.x, `a horn from ${where}`).toBeLessThanOrEqual(size.width - room + 1);
          expect(horn.y, `a horn from ${where}`).toBeLessThan(size.height);
        }
        expect(at.feet.y, `her feet from ${where}`).toBeLessThanOrEqual(size.height - 24 * at.unit + 1);
        if (target === 3.5)
          await shot(
            page,
            `${SCRATCH}/rainbow/camera-${info.project.name}-${size.width}x${size.height}-${name.replace(/ /g, '-')}.png`,
          );
      }
      await untilOver(page);
      expect(await page.evaluate(() => window.__ua!.invariants()), `invariants after ${name}`).toEqual([]);
    }
    expect(noise, 'the console is quiet').toEqual([]);
  });

  test('lets the camera go back to the herd as the rainbow ends', async ({ page }, info) => {
    test.setTimeout(300_000);
    await inTheGarden(page, info);
    expect((await castFrom(page, STAND_SPOTS['the basin']!)).age).not.toBeNull();
    const size = page.viewportSize()!;
    await until(page, 3.5);
    const lifted = await marks(page);
    expect(lifted.body.y - size.height / 2, 'the view is lifted').toBeGreaterThan(30 * lifted.unit);
    await untilOver(page);
    await step(page, 0.5);
    const home = await marks(page);
    expect(Math.abs(home.body.y - size.height / 2), 'back on her body').toBeLessThan(6);
  });

  test('is given more time by a second cast, up to its cap, and is the same rainbow', async ({ page }, info) => {
    test.setTimeout(300_000);
    const noise = watchConsole(page);
    await inTheGarden(page, info);
    expect((await castFrom(page, STAND_SPOTS['the basin']!)).age).not.toBeNull();
    await until(page, 3);
    const first = await lives(page);
    expect(first.pieces, 'one rainbow, in all its pieces').toBe(24);
    expect([first.since.length, first.until.length], 'the pieces start and end together').toEqual([1, 1]);
    expect(first.until[0]! - first.since[0]!, 'the time one cast gives').toBeCloseTo(6.5, 6);
    const lifted = (await marks(page)).body.y;

    await tapWorld(page, await bodyOf(page, 'wildstar'));
    for (let i = 0; i < 30 && (await lives(page)).until[0] === first.until[0]; i++) await step(page, 0.1);
    const second = await lives(page);
    expect(
      [second.pieces, second.since, second.until.length],
      'the same rainbow, not another, with all its pieces in step',
    ).toEqual([24, first.since, 1]);
    expect(second.until[0]! - second.since[0]!, 'given time up to the cap').toBeCloseTo(8, 6);
    expect(Math.abs((await marks(page)).body.y - lifted), 'the camera does not move for it').toBeLessThan(1);

    await until(page, 7.5);
    expect(await ageOf(page), 'it stands past the time one cast gives').not.toBeNull();
    await step(page, 0.8);
    expect(await ageOf(page), 'it is gone at the cap').toBeNull();
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise, 'the console is quiet').toEqual([]);
  });

  test('is left to finish by a cast in its fade, with the camera still coming home', async ({ page }, info) => {
    test.setTimeout(300_000);
    const noise = watchConsole(page);
    await inTheGarden(page, info);
    expect((await castFrom(page, STAND_SPOTS['the basin']!)).age).not.toBeNull();
    const first = await lives(page);
    await until(page, INTO_ITS_FADE);
    const lifts = [(await marks(page)).body.y];
    await tapWorld(page, await bodyOf(page, 'wildstar'));
    for (let i = 0; i < 5; i++) {
      await step(page, 0.15);
      if ((await ageOf(page)) !== null) lifts.push((await marks(page)).body.y);
    }
    expect(lifts.length, 'the fade was watched through her cast').toBeGreaterThan(4);
    for (let i = 1; i < lifts.length; i++)
      expect(lifts[i]!, `the camera at look ${i} of the fade`).toBeLessThanOrEqual(lifts[i - 1]! + 0.5);
    expect((await lives(page)).until, 'no more time for it').toEqual(first.until);
    await step(page, 0.4);
    expect(await ageOf(page), 'it ended when one cast said it would').toBeNull();
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise, 'the console is quiet').toEqual([]);
  });

  test('is not made from the places her light does not reach it from', async ({ page }, info) => {
    test.setTimeout(300_000);
    const noise = watchConsole(page);
    await inTheGarden(page, info);
    for (const spot of FAR_SPOTS) {
      const cast = await castFrom(page, spot);
      expect(cast.released, `her cast let go of the spell at ${spot.x}, ${spot.y}`).toBe(true);
      expect(cast.age, `no rainbow from ${spot.x}, ${spot.y}`).toBeNull();
      await step(page, 3);
      expect(await ageOf(page), `none a while after, from ${spot.x}, ${spot.y}`).toBeNull();
    }
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise, 'the console is quiet').toEqual([]);
  });

  test('leaves the camera on the herd when reduced effects are on, though the rainbow still comes up', async ({
    page,
  }, info) => {
    test.setTimeout(300_000);
    await inTheGarden(page, info);
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    const cast = await castFrom(page, STAND_SPOTS['the basin']!);
    expect(cast.age, 'the rainbow still comes up').not.toBeNull();
    const size = page.viewportSize()!;
    for (const target of [1.5, 3.5]) {
      await until(page, target);
      const at = await marks(page);
      expect(Math.abs(at.body.y - size.height / 2), `the camera at ${target} s`).toBeLessThan(6);
    }
    await shot(page, `${SCRATCH}/rainbow/camera-${info.project.name}-${size.width}x${size.height}-reduced.png`);
  });
});
