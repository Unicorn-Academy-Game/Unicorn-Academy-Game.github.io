import { expect, type Page, test } from '@playwright/test';
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
/** The three mushrooms in the playground, which are red, pink and blue. */
const MUSHROOMS = {
  red: 'playground/mushroom-1',
  pink: 'playground/mushroom-2',
  blue: 'playground/mushroom-3',
} as const;

type Place = 'climb' | 'flight' | 'moon';

interface SkyView {
  readonly place: Place;
  readonly sky: string;
  readonly mode: string;
  /** The row of the cloud she is on, or was last on. -1 is the mushroom. */
  readonly row: number;
  readonly riders: number;
  readonly flowers: number;
}

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * What the game inside the overlay says about itself. The fields are picked inside the page,
 * because a getter on a class does not cross from the page to the test and most of what is wanted
 * is one.
 */
const sky = (page: Page): Promise<SkyView> =>
  page.evaluate(() => {
    const game = window.__ua!.wonders.inside!.wonder as unknown as {
      inspect(): {
        place: Place;
        sky: string;
        flowers: number;
        climb: { leader: { mode: string; to: { row: number } }; riders: unknown[] };
      };
    };
    const v = game.inspect();
    return {
      place: v.place,
      sky: v.sky,
      mode: v.climb.leader.mode,
      row: v.climb.leader.to.row,
      riders: v.climb.riders.length,
      flowers: v.flowers,
    };
  });

/**
 * Where on the screen the cloud in a row that is nearest the leader is, which is where a finger
 * goes to send her there.
 */
const cloudOnScreen = (page: Page, row: number): Promise<{ x: number; y: number }> =>
  page.evaluate((r) => {
    const game = window.__ua!.wonders.inside!.wonder as unknown as {
      inspect(): {
        world: { row(r: number): { x: number; y: number }[] };
        camera: { screenX(x: number, w: number): number; screenY(y: number, h: number): number };
        climb: { leader: { x: number } };
      };
    };
    const v = game.inspect();
    const { w, h } = window.__ua!.wonders.inside!.stage.view;
    const lead = v.climb.leader.x;
    const best = v.world.row(r).reduce((a, c) => (Math.abs(c.x - lead) < Math.abs(a.x - lead) ? c : a));
    return { x: v.camera.screenX(best.x, w), y: v.camera.screenY(best.y - 18, h) };
  }, row);

async function openBounce(page: Page, mushroom: string = MUSHROOMS.red): Promise<void> {
  await inThePlayground(page);
  await standBeside(page, mushroom);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, mushroom));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

async function closeBounce(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

test.describe('the bouncing mushroom', () => {
  test('opens from the mushroom, and a touch on a cloud sends her up to it', async ({ page }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openBounce(page);
    await expect(page.getByRole('dialog', { name: 'Bouncing up through the clouds' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await shot(page, `${SCRATCH}/bounce-open.png`);

    // She starts on the mushroom, in the meadow under the sunrise, and waits to be told.
    const start = await sky(page);
    expect(start).toMatchObject({ place: 'climb', sky: 'sunrise', mode: 'stand', row: -1, riders: 1 });
    await stepGame(page, 1);
    expect((await sky(page)).mode, 'she waits').toBe('stand');

    // A real touch on the first cloud above her is a leap: she is in the air a moment after it.
    const at = await cloudOnScreen(page, 0);
    await page.mouse.click(at.x, at.y);
    await stepGame(page, 0.15);
    expect((await sky(page)).mode, 'in the air after a touch').toBe('hop');
    await shot(page, `${SCRATCH}/bounce-leap.png`);

    // She lands on it and stays, because the finger is gone, and the play has started to fill the
    // first star.
    await stepGame(page, 2);
    const landed = await sky(page);
    expect(landed).toMatchObject({ mode: 'stand', row: 0 });
    await expect.poll(() => page.evaluate(() => window.__ua!.wonders.inside!.wonder.progress)).toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/bounce-cloud.png`);

    await closeBounce(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('takes her up through the door to the moon, lets her play there, and starts again from the meadow', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openBounce(page);
    await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
    expect((await stateOf(page)).phase).toBe('finale');

    // She goes in this order, and does not get stuck in any of it.
    const seen: Place[] = [(await sky(page)).place];
    for (let i = 0; i < 160; i++) {
      await stepGame(page, 0.25);
      const v = await sky(page);
      if (seen[seen.length - 1] !== v.place) seen.push(v.place);
      if (v.place === 'moon' && (await stateOf(page)).phase === 'after') break;
    }
    expect(seen).toEqual(['climb', 'flight', 'moon']);
    await expect.poll(async () => (await stateOf(page)).phase).toBe('after');
    await shot(page, `${SCRATCH}/bounce-moon.png`);

    // On the moon the flowers come up in a wave from where she landed, and a touch on the ground
    // brings up the ones that are left.
    const flowers = (await sky(page)).flowers;
    expect(flowers, 'flowers up after the wave').toBeGreaterThan(10);
    await page.mouse.click(120, 330);
    await stepGame(page, 0.4);
    await page.mouse.click(430, 60);
    await stepGame(page, 0.4);
    expect((await stateOf(page)).phase, 'the play goes on').toBe('after');
    expect((await sky(page)).place).toBe('moon');

    // Play again puts her on the mushroom, and the moon is forgotten.
    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');
    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    expect(await sky(page)).toMatchObject({ place: 'climb', mode: 'stand', row: -1, riders: 1, flowers: 0 });
    expect((await stateOf(page)).stars).toBe(0);

    await closeBounce(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('has a sky for each colour of mushroom', async ({ page }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    for (const [look, expected] of [
      ['pink', 'candy'],
      ['blue', 'starry'],
    ] as const) {
      await openBounce(page, MUSHROOMS[look]);
      expect((await sky(page)).sky, `the sky over the ${look} mushroom`).toBe(expected);
      await shot(page, `${SCRATCH}/bounce-${look}.png`);
      await closeBounce(page);
    }
    expect(noise).toEqual([]);
  });
});
