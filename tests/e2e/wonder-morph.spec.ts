import { expect, type Page, test } from '@playwright/test';
import type { MorphMachine } from '../../src/wonder/games/morph-machine';
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
const GEM_MACHINE = 'playground/morph-1';
const FLOWER_MACHINE = 'playground/morph-2';

type Machine = ReturnType<MorphMachine['inspect']> & {
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
const machine = (page: Page): Promise<Machine> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<Machine, 'view'> };
    const { w, h, unit } = inside.stage.view;
    return { ...game.inspect(), view: { w, h, unit } };
  });

/** How much the player has earned: the stars so far and how far they are to the next. */
const earned = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const w = window.__ua!.wonders.inside!.wonder;
    return w.stars + w.progress;
  });

/**
 * A real touch on the screen at a place in the game's units. A place under one of the overlay's
 * buttons would press the button, which is a mistake in the test and not in the game.
 */
async function touch(page: Page, at: Spot, unit: number): Promise<void> {
  const onGame = await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName === 'CANVAS', [
    at.x * unit,
    at.y * unit,
  ] as const);
  expect(onGame, `a finger at ${Math.round(at.x)},${Math.round(at.y)} is on the game and not on a button`).toBe(true);
  await page.mouse.click(at.x * unit, at.y * unit);
}

/** Whether a place is on the screen. */
const seen = (v: Machine, at: Spot): boolean => at.x > 6 && at.x < v.view.w - 6 && at.y > 6 && at.y < v.view.h;

async function openMachine(page: Page, toy = GEM_MACHINE, friends: readonly string[] = []): Promise<void> {
  // The friends are met on the screen the project gives, which is a little taller than a phone held
  // sideways, because one of them stands near the top of a forest clearing. The machine is played
  // on the phone's.
  await inThePlayground(page, friends);
  await page.setViewportSize(PHONE);
  await standBeside(page, toy);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, toy));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

async function closeGame(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

const onFruit = (v: Machine, i: number): Spot => ({ x: v.fruit[i]!.x, y: v.fruit[i]!.y });
const onFriend = (f: Machine['friends'][number]): Spot => ({ x: f.x, y: f.y });

/**
 * The one thing a child who knows the machine would do next: along the rainbow of fruit, with the
 * lever and the whistle and a friend now and then.
 */
function next(v: Machine, turn: number): Spot {
  if (turn % 9 === 4 && v.fruit.filter((f) => f.here).length >= 5) return v.lever;
  if (turn % 13 === 8 && v.shelf.length >= 3) return v.whistle;
  if (turn % 6 === 5 && v.friends.length > 0) return onFriend(v.friends[turn % v.friends.length]!);
  if (turn % 10 === 7 && v.creatures.length > 0) return v.creatures[0]!;
  const here = v.fruit.map((f, i) => (f.here ? i : -1)).filter((i) => i >= 0);
  return here.length > 0 ? onFruit(v, here[turn % here.length]!) : v.hopper;
}

test.describe('the magic changing machine', () => {
  test('opens from the machine with the cart full and the shelf empty, and a fruit goes in, comes out a gem and stands on the shelf', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openMachine(page, GEM_MACHINE, ['leaf', 'glacier']);
    await expect(page.getByRole('dialog', { name: 'The magic changing machine' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await stepGame(page, 2);
    await shot(page, `${SCRATCH}/morph-open.png`);

    const start = await machine(page);
    expect(start.product, 'apples become gems').toBe('gem');
    expect(start.fruit, 'seven fruit on the cart, one for each colour of the rainbow').toHaveLength(7);
    expect(
      start.fruit.every((f) => f.here),
      'every one of them is on the cart',
    ).toBe(true);
    expect(start.shelf, 'nothing has been made yet').toHaveLength(0);
    expect(start.friends.map((f) => f.id).sort(), 'the herd she has, in front of the machine').toEqual([
      'glacier',
      'leaf',
      'wildstar',
    ]);
    expect(start.hatchling.here).toBe(false);
    for (const [what, at] of [
      ['the lever', start.lever],
      ['the whistle', start.whistle],
      ['the funnel', start.hopper],
      ['the glass', start.dome],
      ...start.fruit.map((f, i) => [`fruit ${i}`, f] as const),
      ...start.friends.map((f) => [f.id, f] as const),
    ] as const) {
      expect(seen(start, at), `${what} is on the screen`).toBe(true);
    }
    // The cart is clear of the friends and of the shelf, so that a finger on one is on that one.
    for (const f of start.friends) {
      for (const fruit of start.fruit)
        expect(Math.hypot(f.x - fruit.x, f.y - fruit.y), `${f.id} is not standing on a fruit`).toBeGreaterThan(fruit.r);
    }

    // The apple, the first of the rainbow. It goes up off the cart and in at the funnel, and the
    // cart gives it back a moment later.
    const apple = start.fruit[0]!;
    await touch(page, apple, start.view.unit);
    await stepGame(page, 0.15);
    expect((await machine(page)).fruit[0]!.here, 'the apple left the cart').toBe(false);
    await expect.poll(() => earned(page), { message: 'a fruit is worth something' }).toBeGreaterThan(0);
    await stepGame(page, 0.7);
    expect((await machine(page)).works.pods, 'it is in the air or in the glass').toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/morph-feeding.png`);
    await stepGame(page, 4);
    const made = await machine(page);
    expect(made.fruit[0]!.here, 'the cart gave the apple back').toBe(true);
    expect(made.shelf, 'one gem is on the shelf').toHaveLength(1);
    expect(made.shelf[0]!.fruit, 'it is the apple that became it').toBe('apple');
    expect(made.shelf[0]!.cell, 'the first place on the shelf').toBe(0);
    expect(seen(made, made.shelf[0]!), 'on the screen').toBe(true);
    await shot(page, `${SCRATCH}/morph-first-gem.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('turns the berry machine into a flower machine: the same cart, a flower for every fruit', async ({ page }) => {
    const noise = watchConsole(page);
    await openMachine(page, FLOWER_MACHINE);
    await stepGame(page, 2);
    const start = await machine(page);
    expect(start.product, 'berries become flowers').toBe('flower');
    await touch(page, onFruit(start, 2), start.view.unit);
    await stepGame(page, 5);
    const made = await machine(page);
    expect(made.shelf, 'one flower is on the shelf').toHaveLength(1);
    expect(made.shelf[0]!.fruit, 'it is the strawberry that became it').toBe(start.fruit[2]!.id);
    await shot(page, `${SCRATCH}/morph-flower.png`);
    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('answers a finger everywhere: the lever sends every fruit in, a friend throws one of her own colour, the whistle plays the shelf, and the shelf, the glass and the sky all answer', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openMachine(page, GEM_MACHINE, ['leaf']);
    await stepGame(page, 2);
    const v = await machine(page);
    const unit = v.view.unit;

    // The lever: all seven fruit go in one after another, and all seven things come out. One of
    // them is a surprise, a little creature that flies about the machine, and not a thing for the
    // shelf.
    let before = await earned(page);
    await touch(page, v.lever, unit);
    await stepGame(page, 0.4);
    expect((await machine(page)).fruit.filter((f) => !f.here).length, 'fruit are leaving the cart').toBeGreaterThan(0);
    await expect.poll(() => earned(page), { message: 'the lever is worth something' }).toBeGreaterThan(before);
    await shot(page, `${SCRATCH}/morph-lever.png`);
    await stepGame(page, 9);
    const pulled = await machine(page);
    expect(pulled.shelf.length + pulled.creatures.length, 'seven things made, one for each fruit').toBe(7);
    expect(pulled.shelf.length, 'and only the surprise is not on the shelf').toBeGreaterThanOrEqual(6);
    expect(new Set(pulled.shelf.map((s) => s.fruit)).size, 'every one of them a different fruit').toBe(
      pulled.shelf.length,
    );
    expect(
      pulled.fruit.every((f) => f.here),
      'the cart is full again',
    ).toBe(true);
    await shot(page, `${SCRATCH}/morph-seven.png`);

    // A friend: she casts, and a fruit of her own colour leaves her horn and goes in.
    before = await earned(page);
    const friend = pulled.friends.find((f) => f.id === 'leaf')!;
    await touch(page, onFriend(friend), unit);
    await stepGame(page, 0.3);
    await expect.poll(() => earned(page), { message: 'a friend is worth something' }).toBeGreaterThan(before);
    await stepGame(page, 5);
    const joined = await machine(page);
    expect(joined.shelf.length + joined.creatures.length, 'her fruit became something too').toBe(8);

    // The shelf: a touch on a thing on it makes it sing.
    before = await earned(page);
    const thing = (await machine(page)).shelf[3]!;
    await touch(page, thing, unit);
    await stepGame(page, 0.3);
    await expect
      .poll(() => earned(page), { message: 'a thing on the shelf is worth something' })
      .toBeGreaterThan(before);

    // The whistle plays the whole shelf, one thing after another.
    before = await earned(page);
    await touch(page, v.whistle, unit);
    await stepGame(page, 0.8);
    await expect.poll(() => earned(page), { message: 'the whistle is worth something' }).toBeGreaterThan(before);
    await shot(page, `${SCRATCH}/morph-whistle.png`);
    await stepGame(page, 2);

    // The glass sloshes, and a touch on the sky answers with a ring and a note.
    before = await earned(page);
    await touch(page, v.dome, unit);
    await stepGame(page, 0.4);
    await expect.poll(() => earned(page), { message: 'the glass is worth something' }).toBeGreaterThan(before);
    await page.mouse.click(40, 120);
    await stepGame(page, 1);

    // A surprise comes to the meadow now and then, and when it does it can be touched.
    for (let i = 0; i < 12 && (await machine(page)).creatures.length === 0; i++) {
      const now = await machine(page);
      await touch(page, onFruit(now, i % 7), unit);
      await stepGame(page, 1.2);
    }
    const crowd = await machine(page);
    expect(crowd.creatures.length, 'a surprise has come').toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/morph-surprise.png`);
    before = await earned(page);
    await touch(page, crowd.creatures[0]!, unit);
    await stepGame(page, 0.3);
    await expect.poll(() => earned(page), { message: 'a surprise is worth something' }).toBeGreaterThan(before);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('can be played to the end with touches alone: the machine overloads, everything on the shelf flies out, a hatchling comes, and the player can play again', async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const noise = watchConsole(page);
    await openMachine(page, GEM_MACHINE, ['leaf', 'glacier', 'river', 'cinder', 'storm']);
    await stepGame(page, 1);
    expect((await machine(page)).friends, 'the whole herd in front of the machine').toHaveLength(6);

    for (let turn = 0; turn < 500; turn++) {
      if ((await stateOf(page)).phase !== 'play') break;
      const v = await machine(page);
      await touch(page, next(v, turn), v.view.unit);
      await stepGame(page, 0.6);
    }
    expect((await stateOf(page)).phase, 'the fifth star began the finale').toBe('finale');
    expect((await stateOf(page)).stars).toBe(5);
    const had = await machine(page);
    expect(had.shelf.length, 'she had made a good many things').toBeGreaterThanOrEqual(6);

    // The machine goes up to full speed, bursts, and the hatchling is there when the smoke clears.
    let loudest = 0;
    for (let i = 0; i < 80 && (await stateOf(page)).phase === 'finale'; i++) {
      loudest = Math.max(loudest, (await machine(page)).overload);
      if (i === 6) await shot(page, `${SCRATCH}/morph-finale-1.png`);
      if (i === 14) await shot(page, `${SCRATCH}/morph-finale-2.png`);
      if (i === 22) await shot(page, `${SCRATCH}/morph-finale-3.png`);
      await stepGame(page, 0.5);
    }
    expect(loudest, 'the machine went up to its fullest').toBeGreaterThan(0.8);
    await expect.poll(async () => (await stateOf(page)).phase, { timeout: 30_000 }).toBe('after');
    await stepGame(page, 2);
    const after = await machine(page);
    expect(after.hatchling.here, 'the hatchling has come').toBe(true);
    expect(seen(after, after.hatchling), 'and she is on the screen').toBe(true);
    await shot(page, `${SCRATCH}/morph-after.png`);

    // The hatchling answers a touch, and the machine goes on working for her.
    await touch(page, after.hatchling, after.view.unit);
    await stepGame(page, 0.5);
    await shot(page, `${SCRATCH}/morph-hatchling-touched.png`);
    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');
    const free = await machine(page);
    await touch(page, onFruit(free, 4), free.view.unit);
    await stepGame(page, 4);
    expect((await machine(page)).works.fed, 'the machine goes on working after the finale').toBeGreaterThan(
      free.works.fed,
    );

    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    expect((await stateOf(page)).stars).toBe(0);
    await stepGame(page, 1.5);
    const fresh = await machine(page);
    expect(fresh.shelf, 'the shelf is empty again').toHaveLength(0);
    expect(fresh.hatchling.here, 'the hatchling has gone home').toBe(false);
    expect(
      fresh.fruit.every((f) => f.here),
      'the cart is full',
    ).toBe(true);
    expect(fresh.works.pods).toBe(0);
    expect(fresh.overload).toBeLessThan(0.1);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('keeps what the player has made, and can be played, when the phone is turned upright and back', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openMachine(page, GEM_MACHINE, ['leaf', 'glacier', 'river']);
    await stepGame(page, 2);
    const v = await machine(page);
    await touch(page, v.lever, v.view.unit);
    await stepGame(page, 9);
    const made = await machine(page);
    expect(made.shelf.length + made.creatures.length, 'seven things made').toBe(7);
    const had = await earned(page);

    const checkRoom = (room: Machine, shape: string, shelved: number): void => {
      expect(room.shelf, `${shape}: what she made is still on the shelf`).toHaveLength(shelved);
      expect(room.friends, `${shape}: the herd is still here`).toHaveLength(made.friends.length);
      for (const [what, at] of [
        ['the lever', room.lever],
        ['the whistle', room.whistle],
        ['the funnel', room.hopper],
        ['the glass', room.dome],
        ...room.fruit.map((f, i) => [`fruit ${i}`, f] as const),
        ...room.friends.map((f) => [f.id, f] as const),
        ...room.shelf.map((s) => [`shelf ${s.cell}`, s] as const),
      ] as const) {
        expect(seen(room, at), `${shape}: ${what} is on the screen`).toBe(true);
      }
      for (const f of room.friends) {
        for (const fruit of room.fruit)
          expect(Math.hypot(f.x - fruit.x, f.y - fruit.y), `${shape}: ${f.id} is not on a fruit`).toBeGreaterThan(
            fruit.r,
          );
      }
    };

    await page.setViewportSize({ width: 360, height: 780 });
    await expect
      .poll(async () => (await machine(page)).view.h, { message: 'the game seeing the new shape of the screen' })
      .toBeGreaterThan(600);
    await stepGame(page, 3);
    const upright = await machine(page);
    checkRoom(upright, 'upright', made.shelf.length);
    expect(await earned(page), 'what she has earned is kept').toBeGreaterThanOrEqual(had);
    await shot(page, `${SCRATCH}/morph-upright.png`);

    // It can be played upright: a fruit goes in and comes out as something on the shelf.
    await touch(page, onFruit(upright, 5), upright.view.unit);
    await stepGame(page, 5);
    const upMore = await machine(page);
    expect(upMore.shelf.length + upMore.creatures.length, 'one more thing').toBe(
      made.shelf.length + made.creatures.length + 1,
    );
    await shot(page, `${SCRATCH}/morph-upright-play.png`);

    await page.setViewportSize(PHONE);
    await expect.poll(async () => (await machine(page)).view.w).toBeGreaterThan(800);
    await stepGame(page, 2);
    const back = await machine(page);
    // What the extra fruit became (a stone or flower on the shelf, or a creature that hiccuped out)
    // depends on the machine's luck, so the shelf is compared with how she left it.
    checkRoom(back, 'back', upMore.shelf.length);
    await shot(page, `${SCRATCH}/morph-back.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
