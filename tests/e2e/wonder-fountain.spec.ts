import { expect, type Page, test } from '@playwright/test';
import type { JewelFountain } from '../../src/wonder/games/jewel-fountain';
import {
  fingerOn,
  inThePlayground,
  SCRATCH,
  shot,
  standBeside,
  step,
  stepUntil,
  tapWorld,
  untilOpen,
  watchConsole,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };
const TOY = 'playground/gem-fountain-1';

type Fountain = ReturnType<JewelFountain['inspect']> & {
  readonly view: { readonly w: number; readonly h: number; readonly unit: number };
};
type Spot = { readonly x: number; readonly y: number };

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * What the game inside the overlay says about itself, picked inside the page because a method on a
 * class does not cross to the test.
 */
const fountain = (page: Page): Promise<Fountain> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<Fountain, 'view'> };
    const { w, h, unit } = inside.stage.view;
    return { ...game.inspect(), view: { w, h, unit } };
  });

/** How much the player has earned: the stars so far and how far they are to the next. */
const earned = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const w = window.__ua!.wonders.inside!.wonder;
    return w.stars + w.progress;
  });

/** Whether a place on the screen is the game and not one of the overlay's buttons. */
const onTheGame = (page: Page, at: Spot, unit: number): Promise<boolean> =>
  page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName === 'CANVAS', [
    at.x * unit,
    at.y * unit,
  ] as const);

/**
 * A real touch at a place in the game's units. A place under a button would press the button, which
 * is a mistake in the test and not in the game.
 */
async function touch(page: Page, at: Spot, unit: number): Promise<void> {
  expect(
    await onTheGame(page, at, unit),
    `a finger at ${Math.round(at.x)},${Math.round(at.y)} is on the game and not on a button`,
  ).toBe(true);
  await page.mouse.click(at.x * unit, at.y * unit);
}

/**
 * A finger put down on one place and drawn through the others, as fast as a hand does it, then
 * lifted.
 */
async function slide(page: Page, through: readonly Spot[], unit: number): Promise<void> {
  const [first, ...rest] = through;
  await page.mouse.move(first!.x * unit, first!.y * unit);
  await page.mouse.down();
  for (const at of rest) await page.mouse.move(at.x * unit, at.y * unit, { steps: 4 });
  await page.mouse.up();
}

const seen = (v: Fountain, at: Spot): boolean => at.x > 6 && at.x < v.view.w - 6 && at.y > 6 && at.y < v.view.h;

async function openFountain(page: Page, friends: readonly string[] = []): Promise<void> {
  await inThePlayground(page, friends);
  await page.setViewportSize(PHONE);
  await standBeside(page, TOY);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, TOY));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

async function closeGame(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

const onJet = (v: Fountain, i: number): Spot => ({ x: v.jets[i]!.x, y: v.jets[i]!.y });

/**
 * The one thing a child who knows the fountain would do next: along the ring, with the gem and a
 * friend now and then.
 */
function next(v: Fountain, turn: number): Spot {
  if (turn % 11 === 5) return v.gem;
  if (turn % 7 === 3 && v.friends.length > 0) return v.friends[turn % v.friends.length]!;
  return onJet(v, turn % v.jets.length);
}

test.describe('the fountain that plays jewels', () => {
  test('opens with seven dry jets and the herd beside the fountain, and a touch makes a jet throw jewels that come down in its pool', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFountain(page, ['leaf', 'glacier']);
    await expect(page.getByRole('dialog', { name: 'A fountain that plays jewels' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await stepGame(page, 2);
    await shot(page, `${SCRATCH}/fountain-open.png`);

    const start = await fountain(page);
    expect(start.jets, 'seven jets, one for each colour of the rainbow').toHaveLength(7);
    expect(
      start.jets.every((j) => !j.on && j.heap === 0 && j.band === 0),
      'all of them still, with nothing in their pools',
    ).toBe(true);
    expect(start.friends.map((f) => f.id).sort(), 'the herd she has, beside the fountain').toEqual([
      'glacier',
      'leaf',
      'wildstar',
    ]);
    expect(start.rainbow.whole).toBe(false);
    for (const [what, at] of [
      ['the gem', start.gem],
      ...start.jets.map((j, i) => [`jet ${i}`, j] as const),
      ...start.friends.map((f) => [f.id, f] as const),
    ] as const) {
      expect(seen(start, at), `${what} is on the screen`).toBe(true);
    }
    for (let i = 0; i < start.jets.length; i++)
      expect(await onTheGame(page, onJet(start, i), start.view.unit), `jet ${i} is not under a button`).toBe(true);
    for (let i = 1; i < start.jets.length; i++) {
      expect(
        Math.hypot(start.jets[i]!.x - start.jets[i - 1]!.x, start.jets[i]!.y - start.jets[i - 1]!.y),
        `jets ${i - 1} and ${i} are far enough apart to be touched one at a time`,
      ).toBeGreaterThan(42);
    }
    for (const f of start.friends) {
      for (const j of start.jets)
        expect(Math.hypot(f.x - j.x, f.y - j.y), `${f.id} is not standing on a jet`).toBeGreaterThan(f.r * 0.8);
    }

    // The middle jet: it goes, jewels leave it, and they come down in its pool and stay there as a
    // heap.
    await touch(page, onJet(start, 3), start.view.unit);
    await stepGame(page, 0.15);
    const going = await fountain(page);
    expect(going.jets[3]!.on, 'the jet is going').toBe(true);
    expect(going.jets[3]!.band, 'and its band of the rainbow is alight').toBeGreaterThan(0.3);
    expect(
      going.jets.filter((_, i) => i !== 3).every((j) => !j.on),
      'and the others are still',
    ).toBe(true);
    await expect.poll(() => earned(page), { message: 'a jet is worth something' }).toBeGreaterThan(0);
    await stepGame(page, 0.5);
    expect((await fountain(page)).inAir, 'jewels are in the air').toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/fountain-jet.png`);
    await stepGame(page, 5);
    const done = await fountain(page);
    expect(done.inAir, 'they have come down').toBe(0);
    expect(done.jets[3]!.heap, 'and they are a heap in the pool').toBeGreaterThan(0);
    expect(done.jets[3]!.on, 'the jet has stopped by itself').toBe(false);
    expect(
      done.jets.filter((_, i) => i !== 3).every((j) => j.heap === 0),
      'no other pool has anything',
    ).toBe(true);
    await shot(page, `${SCRATCH}/fountain-heap.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('answers a finger everywhere: a slide plays the ring and makes the rainbow, a held jet keeps going, the gem throws a fan, a friend sends a comet, and the sky answers', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openFountain(page, ['leaf', 'cinder']);
    await stepGame(page, 2);
    const v = await fountain(page);
    const unit = v.view.unit;
    for (let i = 0; i < v.jets.length; i++) expect(await onTheGame(page, onJet(v, i), unit)).toBe(true);

    // One slide of a finger along the ring, from end to end: every jet plays, and the rainbow
    // stands over the fountain.
    let before = await earned(page);
    await slide(
      page,
      v.jets.map((_, i) => onJet(v, i)),
      unit,
    );
    await stepGame(page, 0.3);
    const played = await fountain(page);
    expect(
      played.jets.every((j) => j.heap > 0 || j.on || j.band > 0),
      'every jet was played by the one slide',
    ).toBe(true);
    expect(played.rainbow.whole, 'all seven bands have been alight, so the rainbow is whole').toBe(true);
    expect(await earned(page), 'a whole scale is worth a good deal').toBeGreaterThan(before + 0.8);
    await shot(page, `${SCRATCH}/fountain-rainbow.png`);
    await stepGame(page, 8);
    const quiet = await fountain(page);
    expect(quiet.rainbow.shining, 'the rainbow fades when nobody keeps it').toBeLessThan(played.rainbow.shining);
    expect(quiet.inAir, 'and every jewel is down').toBe(0);
    expect(
      quiet.jets.every((j) => j.heap > 0),
      'every pool has some in it',
    ).toBe(true);

    // A finger held on a jet keeps it going, and stops it when it lifts.
    await page.mouse.move(onJet(quiet, 2).x * unit, onJet(quiet, 2).y * unit);
    await page.mouse.down();
    await stepGame(page, 2.5);
    expect((await fountain(page)).jets[2]!.on, 'a held jet is still going after two seconds').toBe(true);
    await shot(page, `${SCRATCH}/fountain-held.png`);
    await page.mouse.up();
    await stepGame(page, 3);
    expect((await fountain(page)).jets[2]!.on, 'and it stops soon after the finger lifts').toBe(false);

    // The big gem: a fan of jewels of every colour.
    before = await earned(page);
    await touch(page, quiet.gem, unit);
    await stepGame(page, 0.4);
    await expect.poll(() => earned(page), { message: 'the gem is worth something' }).toBeGreaterThan(before);
    await shot(page, `${SCRATCH}/fountain-gem.png`);
    await stepGame(page, 3);

    // A friend: a comet of her colour goes from her horn to the jet that is hers, and the jet
    // plays.
    before = await earned(page);
    const friend = (await fountain(page)).friends.find((f) => f.id === 'leaf')!;
    const heapBefore = (await fountain(page)).jets.map((j) => j.heap);
    await touch(page, friend, unit);
    await stepGame(page, 0.3);
    await expect.poll(() => earned(page), { message: 'a friend is worth something' }).toBeGreaterThan(before);
    await shot(page, `${SCRATCH}/fountain-friend.png`);
    await stepGame(page, 4);
    const after = await fountain(page);
    expect(
      after.jets.some((j, i) => j.heap > heapBefore[i]!),
      'her jet threw jewels that came down in a pool',
    ).toBe(true);

    // The sky answers too.
    before = await earned(page);
    await page.mouse.click(40, 120);
    await stepGame(page, 1);
    await shot(page, `${SCRATCH}/fountain-sky.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('can be played to the end with touches alone: the rainbow comes, every jet goes, jewels rain from it, and the player can play again', async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const noise = watchConsole(page);
    await openFountain(page, ['leaf', 'glacier', 'river', 'cinder', 'storm']);
    await stepGame(page, 1);
    expect((await fountain(page)).friends, 'the whole herd beside the fountain').toHaveLength(6);

    for (let turn = 0; turn < 700; turn++) {
      if ((await stateOf(page)).phase !== 'play') break;
      const v = await fountain(page);
      await touch(page, next(v, turn), v.view.unit);
      await stepGame(page, 0.45);
    }
    expect((await stateOf(page)).phase, 'the fifth star began the finale').toBe('finale');
    expect((await stateOf(page)).stars).toBe(5);

    // Every jet goes at once under the whole rainbow, and the jewels rain from it, and the pools
    // fill.
    let most = 0;
    let wholeAt = false;
    for (let i = 0; i < 60 && (await stateOf(page)).phase === 'finale'; i++) {
      const now = await fountain(page);
      most = Math.max(most, now.jets.filter((j) => j.on).length);
      wholeAt ||= now.rainbow.whole && now.rainbow.shining >= 6;
      if (i === 6) await shot(page, `${SCRATCH}/fountain-finale-1.png`);
      if (i === 12) await shot(page, `${SCRATCH}/fountain-finale-2.png`);
      if (i === 18) await shot(page, `${SCRATCH}/fountain-finale-3.png`);
      await stepGame(page, 0.4);
    }
    expect(most, 'all seven jets were going together').toBe(7);
    expect(wholeAt, 'under the whole rainbow').toBe(true);
    await expect.poll(async () => (await stateOf(page)).phase, { timeout: 30_000 }).toBe('after');
    await stepGame(page, 2);
    const after = await fountain(page);
    expect(
      after.jets.every((j) => j.heap > 0),
      'every pool is full of jewels',
    ).toBe(true);
    await shot(page, `${SCRATCH}/fountain-after.png`);

    // It goes on being played after the finale, and she can begin again.
    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');
    await touch(page, onJet(after, 1), after.view.unit);
    await stepGame(page, 0.2);
    expect((await fountain(page)).jets[1]!.on, 'a jet still goes').toBe(true);
    await stepGame(page, 3);

    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    expect((await stateOf(page)).stars).toBe(0);
    await stepGame(page, 1.5);
    const fresh = await fountain(page);
    expect(
      fresh.jets.every((j) => j.heap === 0 && !j.on),
      'the pools are empty and the jets still',
    ).toBe(true);
    expect(fresh.rainbow.shining, 'and there is no rainbow').toBe(0);
    expect(fresh.inAir).toBe(0);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('keeps what the player has made, and can be played, when the phone is turned upright and back', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openFountain(page, ['leaf', 'glacier', 'river']);
    await stepGame(page, 2);
    const v = await fountain(page);
    for (const i of [1, 3, 5]) {
      await touch(page, onJet(v, i), v.view.unit);
      await stepGame(page, 4);
    }
    const made = await fountain(page);
    expect(
      made.jets.filter((j) => j.heap > 0),
      'three pools have jewels',
    ).toHaveLength(3);
    const had = await earned(page);

    const checkRoom = async (room: Fountain, shape: string, pools: readonly boolean[]): Promise<void> => {
      expect(room.friends, `${shape}: the herd is still here`).toHaveLength(made.friends.length);
      expect(
        room.jets.map((j) => j.heap > 0),
        `${shape}: the same pools have jewels`,
      ).toEqual(pools);
      for (const [what, at] of [
        ['the gem', room.gem],
        ...room.jets.map((j, i) => [`jet ${i}`, j] as const),
        ...room.friends.map((f) => [f.id, f] as const),
      ] as const) {
        expect(seen(room, at), `${shape}: ${what} is on the screen`).toBe(true);
      }
      for (let i = 0; i < room.jets.length; i++)
        expect(await onTheGame(page, onJet(room, i), room.view.unit), `${shape}: jet ${i} is not under a button`).toBe(
          true,
        );
      for (let i = 1; i < room.jets.length; i++) {
        expect(
          Math.hypot(room.jets[i]!.x - room.jets[i - 1]!.x, room.jets[i]!.y - room.jets[i - 1]!.y),
          `${shape}: jets ${i - 1} and ${i} are far enough apart`,
        ).toBeGreaterThan(38);
      }
      for (const f of room.friends) {
        for (const j of room.jets)
          expect(Math.hypot(f.x - j.x, f.y - j.y), `${shape}: ${f.id} is not on a jet`).toBeGreaterThan(f.r * 0.8);
      }
    };

    await page.setViewportSize({ width: 360, height: 780 });
    await expect
      .poll(async () => (await fountain(page)).view.h, { message: 'the game seeing the new shape of the screen' })
      .toBeGreaterThan(600);
    await stepGame(page, 3);
    const upright = await fountain(page);
    await checkRoom(
      upright,
      'upright',
      made.jets.map((j) => j.heap > 0),
    );
    expect(await earned(page), 'what she has earned is kept').toBeGreaterThanOrEqual(had);
    await shot(page, `${SCRATCH}/fountain-upright.png`);

    // It can be played upright: a jet throws jewels that come down in its pool.
    await touch(page, onJet(upright, 6), upright.view.unit);
    await stepGame(page, 5);
    expect((await fountain(page)).jets[6]!.heap, 'a jet played upright fills its pool').toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/fountain-upright-play.png`);

    await page.setViewportSize(PHONE);
    await expect.poll(async () => (await fountain(page)).view.w).toBeGreaterThan(800);
    await stepGame(page, 2);
    const back = await fountain(page);
    await checkRoom(
      back,
      'back',
      made.jets.map((j, i) => j.heap > 0 || i === 6),
    );
    await shot(page, `${SCRATCH}/fountain-back.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
