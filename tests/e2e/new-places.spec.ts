import { expect, type Page, test } from '@playwright/test';
import {
  FRIENDS,
  freeze,
  hush,
  mapId,
  newWatch,
  openGame,
  play,
  SCRATCH,
  shot,
  spotOn,
  standBelow,
  step,
  stepUntil,
  tapWorld,
  walkThrough,
} from './helpers';

/**
 * The places that came with the beach, the river, the magic hall, the witch's hut, the Santa grove
 * and the people in the palace. Each goes through the real pointer path and the real picture, and a
 * screenshot of each is left in the scratch folder for a person to look at.
 */

async function inThe(page: Page, map: string, spawn: string, friends: readonly string[] = []): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate((ids) => {
    const { recruited } = window.__ua!.controller.world.persistent;
    for (const id of ids) if (!recruited.includes(id as never)) recruited.push(id as never);
  }, friends);
  await page.evaluate(([m, s]) => window.__ua!.controller.travel({ mapId: m!, spawnId: s! }), [map, spawn] as const);
  await hush(page);
  await step(page, 1.5);
}

/** The instances of one kind of prop on this map, in the order the map lists them. */
const propsOf = (page: Page, definitionId: string): Promise<string[]> =>
  page.evaluate(
    (def) =>
      [...window.__ua!.controller.world.interactables.values()]
        .filter((i) => i.definitionId === def)
        .map((i) => i.instanceId),
    definitionId,
  );

const lying = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__ua!.controller.world.pickups.list.map((p) => p.produce));

/** Stands below a prop and taps it where nothing lies over it. */
async function tapProp(page: Page, instanceId: string): Promise<void> {
  await standBelow(page, instanceId, 140);
  await tapWorld(page, await spotOn(page, instanceId));
}

test.describe('the beach', () => {
  test('gives up shells from the sand, a pearl from a clam, and builds a castle a stage at a time', async ({
    page,
  }) => {
    await inThe(page, 'beach', 'from-river');
    await shot(page, `${SCRATCH}/beach-arrive.png`);

    const [dig] = await propsOf(page, 'dig-spot');
    expect(dig, 'there is somewhere to dig').toBeDefined();
    await tapProp(page, dig!);
    await stepUntil(
      page,
      'shells to lie on the sand',
      () => window.__ua!.controller.world.pickups.list.some((p) => p.produce === 'shell'),
      10,
    );
    expect((await lying(page)).filter((p) => p === 'shell').length).toBeGreaterThanOrEqual(2);
    await shot(page, `${SCRATCH}/beach-dig.png`);

    const [clam] = await propsOf(page, 'clam');
    expect(clam, 'there is a clam').toBeDefined();
    await tapProp(page, clam!);
    await stepUntil(
      page,
      'a pearl to roll out of the clam',
      () => window.__ua!.controller.world.pickups.list.some((p) => p.produce === 'pearl'),
      10,
    );

    const [site] = await propsOf(page, 'castle-site');
    expect(site, 'there is sand to build on').toBeDefined();
    const stage = () =>
      page.evaluate((id) => {
        const s = window.__ua!.controller.world.persistent.props[id] as { stage?: number } | undefined;
        return s?.stage ?? 0;
      }, site!);
    for (const want of [1, 2, 3, 0]) {
      await tapProp(page, site!);
      await step(page, 3);
      expect(await stage(), `the castle after another tap`).toBe(want);
      if (want === 3) await shot(page, `${SCRATCH}/beach-castle.png`);
    }
  });

  test('has a lighthouse, shells to collect and a sea that glitters', async ({ page }) => {
    await inThe(page, 'beach', 'from-river');
    expect((await propsOf(page, 'seashell')).length).toBeGreaterThanOrEqual(4);
    expect((await propsOf(page, 'lighthouse')).length).toBe(1);
    await step(page, 2);
    await shot(page, `${SCRATCH}/beach-sea.png`);
  });
});

test.describe('the river and the magic hall', () => {
  test('lets the herd hop across the river on its stones, and takes only Wildstar into the hall', async ({ page }) => {
    await inThe(page, 'river', 'from-garden', FRIENDS);
    await shot(page, `${SCRATCH}/river-arrive.png`);
    const watch = newWatch();
    await walkThrough(page, 'magic-hall', watch, 600);
    expect(await mapId(page)).toBe('magic-hall');
    await step(page, 2);
    expect(Object.keys(await page.evaluate(() => window.__ua!.controller.world.unicorns))).toEqual(['wildstar']);
    await shot(page, `${SCRATCH}/magic-hall-inside.png`);
    await walkThrough(page, 'river', watch, 120);
    expect(await mapId(page)).toBe('river');
    expect(Object.keys(await page.evaluate(() => window.__ua!.controller.world.unicorns)).length).toBe(
      1 + FRIENDS.length,
    );
    expect(watch.problems).toEqual([]);
  });
});

test.describe('the Santa grove', () => {
  test('is snowing in summer, has its people at work, and opens a present with a tap', async ({ page }) => {
    await openGame(page, 'kept', '&season=summer');
    await play(page);
    await freeze(page);
    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'santa-grove', spawnId: 'from-forest' }));
    await hush(page);
    await step(page, 2);
    expect(await page.evaluate(() => window.__ua!.controller.seasonShown)).toBe('winter');
    expect((await page.evaluate(() => window.__ua!.controller.debugWeather())).fall).toBe('snow');
    expect(await page.evaluate(() => window.__ua!.controller.world.npcs.length)).toBeGreaterThanOrEqual(2);

    const presents = await propsOf(page, 'present');
    expect(presents.length).toBeGreaterThanOrEqual(9);
    await tapProp(page, presents[0]!);
    await stepUntil(
      page,
      'the present to open',
      () => [...window.__ua!.controller.world.transient.values()].some((t) => t.kind === 'delight'),
      6,
    );
    await shot(page, `${SCRATCH}/grove-present.png`);
    await step(page, 4);
    await shot(page, `${SCRATCH}/grove-after.png`);
  });

  test('can be reached through the snowy gate in the forest and left by the same way', async ({ page }) => {
    await inThe(page, 'forest', 'start');
    const watch = newWatch();
    await walkThrough(page, 'santa-grove', watch, 400);
    expect(await mapId(page)).toBe('santa-grove');
    await walkThrough(page, 'forest', watch, 400);
    expect(await mapId(page)).toBe('forest');
    expect(watch.problems).toEqual([]);
  });
});

test.describe("Santa's cabin", () => {
  test('takes the herd in by its door, has a fire that roars when tapped and two elves at work, and lets it out again', async ({
    page,
  }) => {
    await inThe(page, 'santa-grove', 'from-forest');
    const watch = newWatch();
    await walkThrough(page, 'santa-cabin', watch, 400);
    expect(await mapId(page)).toBe('santa-cabin');
    await hush(page);
    await step(page, 3);
    expect(await page.evaluate(() => window.__ua!.controller.world.npcs.length)).toBeGreaterThanOrEqual(2);
    await shot(page, `${SCRATCH}/cabin-inside.png`);

    const [hearth] = await propsOf(page, 'cabin-hearth');
    expect(hearth, 'the cabin has a hearth').toBeDefined();
    await tapProp(page, hearth!);
    await stepUntil(
      page,
      'the fire to roar',
      () => [...window.__ua!.controller.world.transient.values()].some((t) => t.kind === 'delight'),
      6,
    );
    await shot(page, `${SCRATCH}/cabin-fire.png`);
    await step(page, 4);

    await walkThrough(page, 'santa-grove', watch, 400);
    expect(await mapId(page)).toBe('santa-grove');
    expect(watch.problems).toEqual([]);
  });
});

test.describe('the people of the palace', () => {
  const ROOMS: readonly [string, string][] = [
    ['palace-hall', 'from-garden'],
    ['palace-dining', 'from-hall'],
    ['palace-tea', 'from-dining'],
    ['palace-bedroom', 'from-tea'],
    ['palace-flowers', 'from-dining'],
    ['palace-gallery', 'from-hall'],
    ['palace-library', 'from-gallery'],
    ['palace-jewel', 'from-library'],
    ['palace-music', 'from-gallery'],
    ['palace-ballroom', 'from-music'],
  ];

  test('has somebody at work in every room', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    for (const [map, spawn] of ROOMS) {
      await page.evaluate(([m, s]) => window.__ua!.controller.travel({ mapId: m!, spawnId: s! }), [
        map,
        spawn,
      ] as const);
      await hush(page);
      await step(page, 3);
      expect(
        await page.evaluate(() => window.__ua!.controller.world.npcs.length),
        `${map} has nobody at work`,
      ).toBeGreaterThanOrEqual(1);
      await shot(page, `${SCRATCH}/people-${map}.png`);
    }
  });
});
