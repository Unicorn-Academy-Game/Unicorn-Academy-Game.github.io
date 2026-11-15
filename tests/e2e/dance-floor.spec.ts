import { expect, type Page, test } from '@playwright/test';
import { PROP_DEFS } from '../../src/content/props';
import {
  fingerOn,
  handBack,
  hush,
  inThePlayground,
  mapId,
  newWatch,
  SCRATCH,
  shot,
  standBeside,
  step,
  stepUntil,
  tapWorld,
  untilArrived,
  untilDelighted,
  untilOpen,
  walkThrough,
  watchConsole,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };
const POPPER = 'playground/popper-1';
/** The ones worth a picture while they are playing. */
const PICTURES = new Set([
  'light-1',
  'light-5',
  'light-7',
  'gem-fountain-1',
  'balloons-2',
  'fireworks-2',
  'cannon-2',
  'mushroom-2',
  'bubbles-2',
  'morph-2',
  'popper-2',
]);
/**
 * A unicorn is about 115 units long from the side. Closer than this and one hides most of another.
 */
const CLOSEST = 78;

const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);
const phaseOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state.phase);
const liveEffects = (page: Page): Promise<number> => page.evaluate(() => window.__ua!.controller.world.effects.length);

/** Where each of the herd stands. */
const herdAt = (page: Page) =>
  page.evaluate(() =>
    Object.entries(window.__ua!.controller.world.unicorns).map(([id, u]) => ({ id, x: u.pos.x, y: u.pos.y })),
  );

/** The distance between the two who stand closest. */
function closest(herd: readonly { x: number; y: number }[]): number {
  let least = Infinity;
  for (let i = 0; i < herd.length; i++)
    for (let j = i + 1; j < herd.length; j++)
      least = Math.min(least, Math.hypot(herd[i]!.x - herd[j]!.x, herd[i]!.y - herd[j]!.y));
  return least;
}

/**
 * Opens the dancing game from the popper in the playground, on the phone's screen, with the friends
 * she has found.
 */
async function openParty(page: Page, friends: readonly string[]): Promise<void> {
  await inThePlayground(page, friends);
  await page.setViewportSize(PHONE);
  await standBeside(page, POPPER);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, POPPER));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

async function closeGame(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

/**
 * Takes the game to its finale by the way a test has, runs the finale out and presses the button a
 * child presses when they are done.
 */
async function finishParty(page: Page): Promise<void> {
  await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
  for (let i = 0; i < 120 && (await phaseOf(page)) !== 'after'; i++) await stepGame(page, 0.5);
  expect(await phaseOf(page), 'the finale ended').toBe('after');
  const done = page.getByRole('button', { name: 'All done' });
  await expect(done).toHaveCSS('opacity', '1');
  await done.click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

/**
 * Goes to the dance floor without the game, with the herd that is asked for and the creatures sent
 * away.
 */
async function onTheDanceFloor(page: Page, friends: readonly string[] = []): Promise<void> {
  await inThePlayground(page, friends);
  await page.setViewportSize(PHONE);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'dance-floor', spawnId: 'from-party' }));
  await untilArrived(page, 'dance-floor');
  await hush(page);
  await step(page, 1.5);
}

test.describe('the dance floor', () => {
  test('is where the herd goes when the dancing game is done: all six in a row on the floor, with the lights on, and nothing said aloud', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const noise = watchConsole(page);
    await openParty(page, ['leaf', 'glacier', 'river', 'cinder', 'storm']);
    await finishParty(page);
    await untilArrived(page, 'dance-floor');
    await hush(page);
    await step(page, 2);

    const herd = await herdAt(page);
    expect(herd, 'the whole herd came').toHaveLength(6);
    for (const u of herd) {
      expect(u.x, `${u.id} is on the floor, east to west`).toBeGreaterThan(700);
      expect(u.x).toBeLessThan(1850);
      expect(u.y, `${u.id} stands in the row the herd is given`).toBeGreaterThan(1130);
      expect(u.y).toBeLessThan(1340);
    }
    expect(closest(herd), 'nobody hides another').toBeGreaterThanOrEqual(CLOSEST);
    const lights = await page.evaluate(
      () =>
        [...window.__ua!.controller.world.interactables.values()].filter((i) => i.definitionId === 'disco-light')
          .length,
    );
    expect(lights, 'the stage lights').toBeGreaterThanOrEqual(8);
    await shot(page, `${SCRATCH}/dance-floor-arrival.png`);

    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(await page.evaluate(() => window.__silence!.spoken), 'the device was never asked to speak').toEqual([]);
    expect(noise).toEqual([]);
  });

  test('answers a tap on every light and every toy with something to see, and saves nothing', async ({ page }) => {
    test.setTimeout(900_000);
    await onTheDanceFloor(page);
    const ids = await page.evaluate(() =>
      [...window.__ua!.controller.world.interactables.keys()].filter((id) => id.startsWith('dance-floor/')),
    );
    expect(ids.length, 'lights and toys on the floor').toBeGreaterThanOrEqual(28);
    for (const id of ids) {
      const name = id.slice('dance-floor/'.length);
      await standBeside(page, id);
      await step(page, 2);
      await tapWorld(page, await fingerOn(page, id));
      await untilDelighted(page, id);
      expect(await liveEffects(page), name).toBeGreaterThan(0);
      if (PICTURES.has(name)) {
        await step(page, name === 'fireworks-2' ? 0.7 : name === 'cannon-2' ? 0.5 : name === 'popper-2' ? 0.8 : 0.35);
        await shot(page, `${SCRATCH}/dance-floor-${name}.png`);
      }
      await step(page, 4);
      // A toy that has a game of its own gives the whole screen to it. She is done with it before
      // she goes on to the next toy.
      const definition = await page.evaluate(
        (i) => window.__ua!.controller.world.interactables.get(i)!.definitionId,
        id,
      );
      if (PROP_DEFS[definition]?.tap === 'minigame') await handBack(page, id);
    }
    expect(await mapId(page), 'a game closed before its finale leads nowhere').toBe('dance-floor');
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(
      await page.evaluate(() =>
        Object.keys(window.__ua!.controller.world.persistent.props).filter((p) => p.startsWith('dance-floor/')),
      ),
      'saved props',
    ).toEqual([]);
  });

  test('is left by the glowing place at the south edge, and the herd stands in a row on the paving of the playground', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await onTheDanceFloor(page, ['leaf', 'glacier']);
    await shot(page, `${SCRATCH}/dance-floor-before-leaving.png`);
    const watch = newWatch();
    await walkThrough(page, 'playground', watch);
    expect(await mapId(page)).toBe('playground');
    await hush(page);
    await step(page, 2);
    await shot(page, `${SCRATCH}/dance-floor-back-in-the-playground.png`);
    const herd = await herdAt(page);
    expect(herd).toHaveLength(3);
    expect(closest(herd), 'nobody hides another').toBeGreaterThanOrEqual(CLOSEST);
    const spot = await page.evaluate(
      () => window.__ua!.controller.world.map.spawns.find((s) => s.spawnId === 'from-dance-floor')!.points[0]!,
    );
    const lead = herd.find((u) => u.id === 'wildstar')!;
    expect(
      Math.hypot(lead.x - spot.x, lead.y - spot.y),
      'she stands where the herd is put when it comes back',
    ).toBeLessThan(260);
    expect(watch.problems).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('is not where a dancing game leads when she leaves it before its finale', async ({ page }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openParty(page, ['leaf']);
    await stepGame(page, 3);
    expect(await phaseOf(page), 'the party is still on').toBe('play');
    await closeGame(page);
    await step(page, 3);
    expect(await mapId(page), 'she is where she was').toBe('playground');
    expect(await page.evaluate(() => window.__ua!.controller.phase)).toBe('playing');
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
