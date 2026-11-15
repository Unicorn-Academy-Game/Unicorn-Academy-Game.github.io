import { expect, type Page, test } from '@playwright/test';
import { MANOR_CODE } from '../../src/content/manor';
import type { FinderFinale } from '../../src/wonder/games/finder-finale';
import type { ManorLift } from '../../src/wonder/games/manor-lift';
import type { ManorWord } from '../../src/wonder/games/manor-word';
import type { StatuePostcard } from '../../src/wonder/games/statue-postcard';
import {
  freeze,
  hush,
  openGame,
  play,
  SCRATCH,
  shot,
  step,
  untilArrived,
  untilClosed,
  watchConsole,
  watchScene,
} from './helpers';

/**
 * The scenes that are watched and not played: a statue's postcard, the player's word going into the
 * manor door, the lift, and the party when the last friend is found. Each is opened here the way
 * the page opens it, run on its own clock, and left to close by itself, which is how a child sees
 * it.
 */

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };
const STATUES = [
  'crystal-fox',
  'moon-hare',
  'star-whale',
  'storm-bird',
  'coral-seahorse',
  'ember-drake',
  'cloud-lion',
  'glow-owl',
] as const;
const ALL = ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm'] as const;

const open = (page: Page, game: string, look?: string): Promise<void> =>
  page.evaluate(
    ({ game, look }) => window.__ua!.wonders.open({ game, ...(look ? { look } : {}), at: { x: 430, y: 250 } }),
    { game, look },
  );

const opened = (page: Page): Promise<void> =>
  expect
    .poll(() => page.evaluate(() => window.__ua!.wonders.state.where), {
      message: 'the picture opening',
      timeout: 20_000,
    })
    .toBe('open');

/**
 * What the scene says about itself, picked inside the page because a method on a class does not
 * cross to the test.
 */
const inspect = <T>(page: Page): Promise<T> =>
  page.evaluate(() => (window.__ua!.wonders.inside!.wonder as unknown as { inspect(): unknown }).inspect() as never);

const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * Runs what is left of the scene at once, and waits for the screen to be given back, which it does
 * by itself a moment after the scene ends.
 */
async function finish(page: Page): Promise<void> {
  await page.evaluate(() => window.__ua!.wonders.inside?.stage.step(12));
  await untilClosed(page);
}

/**
 * Runs the scene's clock on a tenth of a second at a time until it says so. A scene starts as the
 * picture opens, which takes a moment of real time of its own, so a test cannot count on how far
 * along it is when it first looks, only on what it shows when something has happened.
 */
async function until<T>(page: Page, what: string, ready: (seen: T) => boolean, seconds: number): Promise<T> {
  for (let waited = 0; waited <= seconds; waited += 0.1) {
    const seen = await inspect<T>(page);
    if (ready(seen)) return seen;
    await stepGame(page, 0.1);
  }
  throw new Error(`the scene had not ${what} after ${seconds} seconds of its own time`);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openGame(page);
  await play(page);
});

test.describe('a postcard from each statue', () => {
  // The statues are drawn from the manor's own pictures, which are loaded when she goes in, and a
  // statue is only ever tapped there.
  test.beforeEach(async ({ page }) => {
    await freeze(page);
    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'manor-hall', spawnId: 'from-forest' }));
    await untilArrived(page, 'manor-hall');
    await hush(page);
    await step(page, 0.5);
  });

  for (const name of STATUES) {
    test(`${name}: wakes, plays its own tune and closes by itself`, async ({ page }) => {
      const noise = watchConsole(page);
      // The page opens it with the definition of the statue that was tapped.
      await open(page, 'statue-postcard', `statue-${name}`);
      await opened(page);
      const start = await inspect<ReturnType<StatuePostcard['inspect']>>(page);
      expect(start.name).toBe(name);
      expect(start.statue.drawn, 'the statue is drawn from the picture the manor already loaded').toBe(true);
      expect(start.statue.tall).toBeGreaterThan(100);
      await stepGame(page, 3.8);
      const mid = await inspect<ReturnType<StatuePostcard['inspect']>>(page);
      expect(mid.awake, 'it has woken').toBeGreaterThan(0.9);
      expect(mid.lit, 'and the room with it').toBeGreaterThan(0.9);
      expect(mid.notes, 'and played notes').toBeGreaterThan(3);
      if (name === 'storm-bird' || name === 'star-whale') await shot(page, `${SCRATCH}/cinema-postcard-${name}.png`);
      await finish(page);
      expect(noise).toEqual([]);
    });
  }

  test('a touch on the picture is a note and a spark and does not end it', async ({ page }) => {
    await open(page, 'statue-postcard', 'statue-glow-owl');
    await opened(page);
    await stepGame(page, 2);
    const before = (await inspect<ReturnType<StatuePostcard['inspect']>>(page)).notes;
    await page.evaluate(() => {
      const { stage } = window.__ua!.wonders.inside!;
      stage.inject('down', 1, stage.view.w * 0.3, stage.view.h * 0.5);
      stage.inject('up', 1, stage.view.w * 0.3, stage.view.h * 0.5);
    });
    await stepGame(page, 0.2);
    expect((await inspect<ReturnType<StatuePostcard['inspect']>>(page)).notes).toBeGreaterThan(before);
    expect(await page.evaluate(() => window.__ua!.wonders.isOpen)).toBe(true);
    await finish(page);
  });
});

test.describe("the player's word goes into the door", () => {
  test('every letter of it flies into the lock, the doors open on the hall, and the picture closes by itself', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await open(page, 'manor-word');
    await opened(page);
    const start = await inspect<ReturnType<ManorWord['inspect']>>(page);
    expect(start.letters.join(''), 'the word she typed').toBe(MANOR_CODE.toUpperCase());
    expect(start.landed).toBe(0);
    expect(start.open).toBe(0);
    await stepGame(page, 1.4);
    const mid = await inspect<ReturnType<ManorWord['inspect']>>(page);
    expect(mid.landed, 'some of the letters are in').toBeGreaterThan(0);
    expect(mid.landed).toBeLessThan(start.letters.length);
    await shot(page, `${SCRATCH}/cinema-word-letters.png`);
    await stepGame(page, 3.2);
    const end = await inspect<ReturnType<ManorWord['inspect']>>(page);
    expect(end.landed, 'every letter is in').toBe(end.letters.length);
    expect(end.open, 'and the doors are open').toBeGreaterThan(0.95);
    await shot(page, `${SCRATCH}/cinema-word-open.png`);
    await finish(page);
    expect(noise).toEqual([]);
  });

  test('is the same picture on a tall screen, with the door wide and the pumpkins on the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await open(page, 'manor-word');
    await opened(page);
    await stepGame(page, 1.2);
    const seen = await inspect<ReturnType<ManorWord['inspect']>>(page);
    expect(seen.door.x - seen.door.w / 2, 'the door is on the screen').toBeGreaterThanOrEqual(0);
    expect(seen.door.x + seen.door.w / 2).toBeLessThanOrEqual(seen.size.w);
    for (const tile of seen.tiles) {
      expect(tile.x, 'a letter is on the screen').toBeGreaterThan(0);
      expect(tile.x).toBeLessThan(seen.size.w);
    }
    await shot(page, `${SCRATCH}/cinema-word-tall.png`);
    await finish(page);
  });
});

test.describe('the golden lift', () => {
  test('going up shuts the doors, climbs one floor, rings, and opens them again by itself', async ({ page }) => {
    const noise = watchConsole(page);
    await open(page, 'manor-lift', 'up');
    await opened(page);
    type Lift = ReturnType<ManorLift['inspect']>;
    const moving = await until<Lift>(page, 'begun to move', (l) => l.moving, 4);
    expect(moving.shut, 'the doors are shut before it moves').toBeGreaterThan(0.99);
    expect(moving.floor).toBe('G');
    await shot(page, `${SCRATCH}/cinema-lift-moving.png`);
    const there = await until<Lift>(page, 'arrived', (l) => l.arrived, 4);
    expect(there.floor).toBe('1');
    expect(there.shut, 'it arrives with the doors shut').toBeGreaterThan(0.99);
    const parted = await until<Lift>(page, 'opened its doors', (l) => l.opening && l.shut < 0.5, 4);
    expect(parted.moving).toBe(false);
    await untilClosed(page);
    expect(noise).toEqual([]);
  });

  test('going down starts on the floor above and ends on the ground, with no floor in between that the manor does not have', async ({
    page,
  }) => {
    await open(page, 'manor-lift', 'down');
    await opened(page);
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const lift = await inspect<ReturnType<ManorLift['inspect']>>(page).catch(() => null);
      if (!lift) break;
      if (seen.at(-1) !== lift.floor) seen.push(lift.floor);
      await stepGame(page, 0.2).catch(() => undefined);
    }
    expect(seen).toEqual(['1', 'G']);
    await untilClosed(page);
  });
});

test.describe('all the unicorns together', () => {
  /** The world as it is when the last friend has joined: all six are hers. */
  const everyone = (page: Page): Promise<void> =>
    page.evaluate((ids) => {
      const { recruited } = window.__ua!.controller.world.persistent;
      for (const id of ids) if (!recruited.includes(id)) recruited.push(id);
    }, ALL.slice(1));

  test('the friends run in, each casts a firework of her own, then they cheer together and it closes by itself', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await everyone(page);
    await open(page, 'finder-finale');
    await opened(page);
    const start = await inspect<ReturnType<FinderFinale['inspect']>>(page);
    expect(start.friends.map((f) => f.id).sort()).toEqual([...ALL].sort());
    expect(start.together).toBe(false);
    type Party = ReturnType<FinderFinale['inspect']>;
    const lined = await until<Party>(page, 'got them all to their places', (p) => p.friends.every((f) => f.arrived), 5);
    expect(lined.bow, 'the rainbow has drawn').toBeGreaterThan(0.9);
    // Nobody stands on anyone else, and everyone is on the screen.
    for (const f of lined.friends) {
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(lined.size.w);
    }
    const places = new Set(lined.friends.map((f) => `${Math.round(f.x)},${Math.round(f.y)}`));
    expect(places.size, 'six different places').toBe(6);
    await shot(page, `${SCRATCH}/cinema-finale-line.png`);
    const casting = await until<Party>(page, 'cast in turn', (p) => p.friends.filter((f) => f.cast).length >= 2, 6);
    expect(casting.together, 'not yet, with some still to cast').toBe(false);
    await shot(page, `${SCRATCH}/cinema-finale-casting.png`);
    const party = await until<Party>(page, 'cheered together', (p) => p.together, 8);
    expect(
      party.friends.every((f) => f.cast),
      'every friend has cast by then',
    ).toBe(true);
    await shot(page, `${SCRATCH}/cinema-finale-party.png`);
    await finish(page);
    expect(noise).toEqual([]);
  });

  test('opens over the banner that says it, and the two share the screen', async ({ page }) => {
    await everyone(page);
    await page.evaluate((all) => window.__ua!.ui.unicornFound('storm', all), [...ALL]);
    await expect(page.locator('.found-banner[data-finale="true"]')).toBeVisible();
    await open(page, 'finder-finale');
    await opened(page);
    await until<ReturnType<FinderFinale['inspect']>>(
      page,
      'cast in turn',
      (p) => p.friends.filter((f) => f.cast).length >= 2,
      8,
    );
    await shot(page, `${SCRATCH}/cinema-finale-banner.png`);
    await finish(page);
  });

  test('stands the friends in a pyramid on a tall screen, and everyone is on it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await everyone(page);
    await open(page, 'finder-finale');
    await opened(page);
    await stepGame(page, 2.6);
    const seen = await inspect<ReturnType<FinderFinale['inspect']>>(page);
    for (const f of seen.friends) {
      expect(f.x).toBeGreaterThan(20);
      expect(f.x).toBeLessThan(seen.size.w - 20);
      expect(f.y).toBeLessThan(seen.size.h);
    }
    expect(new Set(seen.friends.map((f) => Math.round(f.y))).size, 'in rows').toBeGreaterThan(1);
    await shot(page, `${SCRATCH}/cinema-finale-tall.png`);
    await finish(page);
  });

  test('with only Wildstar found it is still her picture, and with fewer effects it still ends', async ({ page }) => {
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await open(page, 'finder-finale');
    await opened(page);
    expect((await inspect<ReturnType<FinderFinale['inspect']>>(page)).friends.map((f) => f.id)).toEqual(['wildstar']);
    await shot(page, `${SCRATCH}/cinema-finale-calm.png`);
    await finish(page);
    for (const [game, look] of [
      ['statue-postcard', 'statue-star-whale'],
      ['manor-word', undefined],
      ['manor-lift', 'up'],
    ] as const) {
      await open(page, game, look);
      await opened(page);
      await watchScene(page, game, 12);
    }
  });
});
