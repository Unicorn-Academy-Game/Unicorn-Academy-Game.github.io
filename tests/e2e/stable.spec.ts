import { expect, type Page, test } from '@playwright/test';
import {
  approachOf,
  centreOf,
  freeze,
  hush,
  openGame,
  play,
  SCRATCH,
  shot,
  standAt,
  step,
  stepUntil,
  tapWorld,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };

const liveEffects = (page: Page): Promise<number> => page.evaluate(() => window.__ua!.controller.world.effects.length);

async function inTheStable(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'stable', spawnId: 'from-garden' }));
  await hush(page);
  await step(page, 1.5);
}

test.describe('the stable', () => {
  test('keeps a unicorn in every stall, and each one answers a tap with hearts', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await inTheStable(page);
    await shot(page, `${SCRATCH}/stable-arrival.png`);
    for (let n = 1; n <= 6; n++) {
      const id = `stable/boxed-${n}`;
      await standAt(page, await approachOf(page, id));
      await step(page, 3);
      await tapWorld(page, await centreOf(page, id));
      await stepUntil(page, `stall ${n} to answer`, () => window.__ua!.controller.world.effects.length > 0, 8);
      expect(await liveEffects(page), `stall ${n}`).toBeGreaterThan(0);
      if (n === 1 || n === 4) await shot(page, `${SCRATCH}/stable-boxed-${n}.png`);
      await step(page, 3);
    }
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('saves nothing about the boxed unicorns, however often they are tapped', async ({ page }) => {
    await inTheStable(page);
    const id = 'stable/boxed-2';
    await standAt(page, await approachOf(page, id));
    for (let i = 0; i < 4; i++) {
      await tapWorld(page, await centreOf(page, id));
      await step(page, 3);
    }
    expect(
      await page.evaluate(() =>
        Object.keys(window.__ua!.controller.world.persistent.props).filter((p) => p.includes('boxed')),
      ),
      'saved props',
    ).toEqual([]);
  });
});
