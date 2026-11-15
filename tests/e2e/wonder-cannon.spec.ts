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
/** The two cannons in the playground, which are gold with stars and pink with hearts. */
const CANNONS = { star: 'playground/cannon-1', heart: 'playground/cannon-2' } as const;

interface CannonView {
  readonly stars: readonly { readonly x: number; readonly y: number; readonly awake: boolean }[];
  readonly awake: number;
  readonly flipped: boolean;
  readonly orders: number;
  readonly shots: number;
  readonly view: { readonly w: number; readonly h: number; readonly unit: number };
}

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * What the game inside the overlay says about itself, picked inside the page because a method on a
 * class does not cross to the test.
 */
const cannon = (page: Page): Promise<CannonView> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<CannonView, 'view'> };
    const v = game.inspect();
    const { w, h, unit } = inside.stage.view;
    return {
      stars: v.stars.map((s) => ({ x: s.x, y: s.y, awake: s.awake })),
      awake: v.awake,
      flipped: v.flipped,
      orders: v.orders,
      shots: v.shots,
      view: { w, h, unit },
    };
  });

/** A real touch on the screen where a star of the picture is. */
async function touchStar(page: Page, star: { x: number; y: number }, unit: number): Promise<void> {
  await page.mouse.click(star.x * unit, star.y * unit);
}

async function openCannon(page: Page, which: string = CANNONS.star): Promise<void> {
  await inThePlayground(page);
  await standBeside(page, which);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, which));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

async function closeCannon(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

test.describe('the star cannon', () => {
  test('opens from the cannon, sleeps with a nightcap on every star, and a touch fires a shell that wakes the stars it reaches', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openCannon(page);
    await expect(page.getByRole('dialog', { name: 'Waking the stars with a cannon' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await shot(page, `${SCRATCH}/cannon-open.png`);

    const start = await cannon(page);
    expect(start.stars, 'twenty one stars of the unicorn').toHaveLength(21);
    expect(start.awake).toBe(0);
    // The picture is on the screen, whole, and a phone held sideways gets the unicorn the other way
    // round so she is bigger.
    for (const s of start.stars) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(start.view.w);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(start.view.h);
    }
    expect(start.flipped).toBe(true);

    // A real touch on a star: the cannon takes aim, the shell flies, it opens, and the star it
    // reached is awake.
    await touchStar(page, start.stars[7]!, start.view.unit);
    await stepGame(page, 0.15);
    const aimed = await cannon(page);
    expect(aimed.orders + aimed.shots, 'the touch was heard').toBeGreaterThan(0);
    await stepGame(page, 0.4);
    await shot(page, `${SCRATCH}/cannon-flight.png`);
    await stepGame(page, 1.6);
    const woke = await cannon(page);
    expect(woke.awake, 'the shell woke what it reached').toBeGreaterThanOrEqual(1);
    expect(woke.stars[7]!.awake, 'the star that was touched').toBe(true);
    await expect.poll(() => page.evaluate(() => window.__ua!.wonders.inside!.wonder.progress)).toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/cannon-woke.png`);

    await closeCannon(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('can be played to the end with touches alone: the picture sings, the sky bursts, and the player can play it again', async ({
    page,
  }) => {
    // Playing it through took from 51 s to over 120 s as the machine got busier, and the default is
    // 120 s.
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openCannon(page);

    // Touch the nearest star still asleep, again and again, as a child who is not hurrying would.
    for (let shots = 0; shots < 60; shots++) {
      const v = await cannon(page);
      if (v.awake === 21 || (await stateOf(page)).phase !== 'play') break;
      const asleep = v.stars.filter((s) => !s.awake);
      await touchStar(page, asleep[0]!, v.view.unit);
      await stepGame(page, 1.1);
    }
    expect((await cannon(page)).awake, 'every star woken by touching').toBe(21);
    await expect.poll(async () => (await stateOf(page)).phase).toBe('finale');
    expect((await stateOf(page)).stars, 'all five stars of the meter').toBe(5);

    // The finale ends by itself, and the picture is whole and lit.
    for (let i = 0; i < 160 && (await stateOf(page)).phase === 'finale'; i++) await stepGame(page, 0.25);
    await expect.poll(async () => (await stateOf(page)).phase).toBe('after');
    await shot(page, `${SCRATCH}/cannon-after.png`);

    // Afterwards a touch on a star makes it sing, and the buttons are there.
    const after = await cannon(page);
    await touchStar(page, after.stars[3]!, after.view.unit);
    await stepGame(page, 0.3);
    expect((await cannon(page)).orders + (await cannon(page)).shots, 'a touch is still heard').toBeGreaterThan(0);
    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');

    // Play again puts the sleepers back to bed.
    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    const fresh = await cannon(page);
    expect(fresh.awake).toBe(0);
    expect((await stateOf(page)).stars).toBe(0);

    await closeCannon(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('has a heart of sleeping hearts for the pink cannon', async ({ page }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openCannon(page, CANNONS.heart);
    const v = await cannon(page);
    expect(v.stars).toHaveLength(21);
    expect(v.flipped, 'a heart is the same either way round').toBe(false);
    await shot(page, `${SCRATCH}/cannon-heart.png`);
    await closeCannon(page);
    expect(noise).toEqual([]);
  });

  test('keeps the stars that are awake awake, and the whole picture on the screen, when the phone is turned upright and back', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openCannon(page);
    const start = await cannon(page);
    await touchStar(page, start.stars[7]!, start.view.unit);
    await stepGame(page, 2);
    const before = await cannon(page);
    expect(before.awake).toBeGreaterThanOrEqual(1);

    await page.setViewportSize({ width: 360, height: 780 });
    await expect
      .poll(async () => (await cannon(page)).view.h, { message: 'the game seeing the new shape of the screen' })
      .toBeGreaterThan(600);
    await stepGame(page, 0.3);
    const upright = await cannon(page);
    expect(upright.awake, 'the stars that were awake still are').toBe(before.awake);
    for (const s of upright.stars) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(upright.view.w);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(upright.view.h);
    }
    await shot(page, `${SCRATCH}/cannon-upright.png`);

    await page.setViewportSize(PHONE);
    await expect.poll(async () => (await cannon(page)).view.w).toBeGreaterThan(800);
    await stepGame(page, 0.3);
    const back = await cannon(page);
    expect(back.awake).toBe(before.awake);
    expect(back.stars.map((s) => Math.round(s.x))).toEqual(before.stars.map((s) => Math.round(s.x)));

    await closeCannon(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
