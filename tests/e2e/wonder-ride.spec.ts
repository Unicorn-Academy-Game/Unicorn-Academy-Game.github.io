import { expect, type Page, test } from '@playwright/test';
import { fingerOn, inThePlayground, SCRATCH, shot, standBeside, step, stepUntil, tapWorld } from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };
const SLIDE = 'playground/slide-1';

interface RideView {
  readonly runner: { x: number; vx: number; grounded: boolean };
  readonly place: 'ride' | 'finale' | 'lagoon';
  /**
   * Which part of the way the finale is on, or null while she is still running along the rainbow.
   */
  readonly part: 'run' | 'loop' | 'ramp' | 'air' | 'water' | null;
}

const where = (page: Page): Promise<string> => page.evaluate(() => window.__ua!.wonders.state.where);
const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
/**
 * What the game inside the overlay says about itself. The fields are picked inside the page,
 * because a getter on a class does not cross from the page to the test and `part` is one.
 */
const ride = (page: Page): Promise<RideView> =>
  page.evaluate(() => {
    const game = window.__ua!.wonders.inside!.wonder as unknown as {
      inspect(): {
        runner: { x: number; vx: number; grounded: boolean };
        place: 'ride' | 'finale' | 'lagoon';
        pilot: { part: 'run' | 'loop' | 'ramp' | 'air' | 'water' } | null;
      };
    };
    const v = game.inspect();
    return {
      runner: { x: v.runner.x, vx: v.runner.vx, grounded: v.runner.grounded },
      place: v.place,
      part: v.pilot?.part ?? null,
    };
  });

async function openRide(page: Page): Promise<void> {
  await inThePlayground(page);
  await standBeside(page, SLIDE);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, SLIDE));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await expect.poll(() => where(page), { message: 'the picture opening', timeout: 20_000 }).toBe('open');
}

test.describe('the rainbow ride', () => {
  test('opens from the slide, runs along a rainbow, and a tap is a leap', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize(PHONE);
    await openRide(page);
    await expect(page.getByRole('dialog', { name: 'A ride down the rainbow' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await shot(page, `${SCRATCH}/ride-open.png`);

    // She is already running, along ground that is under her, and nothing she does can stop her.
    const a = await ride(page);
    expect(a.place).toBe('ride');
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(1.5));
    const b = await ride(page);
    expect(b.runner.x, 'how far she has run in a second and a half').toBeGreaterThan(a.runner.x + 150);

    // A real tap on the screen is a leap: she is in the air a moment after it.
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(0.4));
    await page.mouse.click(430, 160);
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(0.2));
    expect((await ride(page)).runner.grounded, 'in the air after a tap').toBe(false);
    await shot(page, `${SCRATCH}/ride-leap.png`);

    await page.locator('.wonder-done').click();
    await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('gives her the loop, the leap across the sky and the pool, and then lets her play in it and ride again', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize(PHONE);
    await openRide(page);
    await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
    expect((await stateOf(page)).phase).toBe('finale');

    // The rainbow carries her on, through the hoops and the loop, up the ramp and into the air, in
    // this order.
    const seen: string[] = [];
    for (let i = 0; i < 120; i++) {
      await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(0.25));
      const v = await ride(page);
      const mark = v.place === 'ride' ? 'ride' : v.place === 'lagoon' ? 'lagoon' : (v.part ?? 'finale');
      if (seen[seen.length - 1] !== mark) seen.push(mark);
      if (mark === 'lagoon') break;
    }
    // ("finale" with no part is only the instant between the handover and the rainbow taking her,
    // so it is not a part of the way.)
    expect(seen.filter((m) => m !== 'finale')).toEqual(['ride', 'run', 'loop', 'ramp', 'air', 'water', 'lagoon']);
    await expect.poll(async () => (await stateOf(page)).phase).toBe('after');
    await shot(page, `${SCRATCH}/ride-lagoon.png`);

    // In the pool a tap is a game too: it makes jewels jump, and the game goes on.
    await page.mouse.click(300, 285);
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(0.4));
    await page.mouse.click(480, 80);
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(0.4));
    expect((await stateOf(page)).phase).toBe('after');

    // Play again starts a new ride from the beginning, and does not remember the old one.
    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');
    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    const fresh = await ride(page);
    expect(fresh.place).toBe('ride');
    expect(fresh.part).toBeNull();
    expect((await stateOf(page)).stars).toBe(0);
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(2));
    expect((await ride(page)).runner.x).toBeGreaterThan(fresh.runner.x + 200);

    await page.locator('.wonder-done').click();
    await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
    expect(errors).toEqual([]);
  });
});
