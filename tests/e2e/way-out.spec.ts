import { expect, type Page, test } from '@playwright/test';
import { freeze, mapId, openGame, play, SCRATCH, shot, step, untilArrived } from './helpers';

/** Each room of the palace and a spawn in it, the way a visit comes in. */
const ROOMS = [
  ['palace-hall', 'from-garden'],
  ['palace-dining', 'from-hall'],
  ['palace-tea', 'from-dining'],
  ['palace-gallery', 'from-hall'],
  ['palace-library', 'from-gallery'],
  ['palace-music', 'from-gallery'],
  ['palace-ballroom', 'from-music'],
  ['palace-flowers', 'from-dining'],
  ['palace-bedroom', 'from-tea'],
  ['palace-jewel', 'from-library'],
] as const;

/** The screens a child holds: a small phone sideways, a big phone sideways, a tablet upright. */
const SCREENS = [
  { width: 568, height: 320 },
  { width: 863, height: 360 },
  { width: 820, height: 1180 },
] as const;

const button = (page: Page) => page.getByRole('button', { name: 'Go outside' });

async function travel(page: Page, mapId: string, spawnId: string): Promise<void> {
  await page.evaluate(([m, s]) => window.__ua!.controller.travel({ mapId: m!, spawnId: s! }), [
    mapId,
    spawnId,
  ] as const);
  await untilArrived(page, mapId);
  await step(page, 0.6);
}

test.describe('the way out of the palace', () => {
  test.setTimeout(480_000);

  test('is on the screen in every room, and one tap takes the herd out to the lawn', async ({ page }) => {
    await page.setViewportSize(SCREENS[1]);
    await openGame(page);
    await play(page);
    await freeze(page);

    for (const [room, spawn] of ROOMS) {
      await travel(page, room, spawn);
      await expect(button(page), `${room} has the button`).toBeVisible();
      await button(page).click();
      await untilArrived(page, 'palace-garden');
      expect(await mapId(page), room).toBe('palace-garden');
      await step(page, 0.6);
      await expect(button(page), 'the garden has none').toBeHidden();
    }
  });

  test('comes out at the palace door, facing the garden', async ({ page }) => {
    await page.setViewportSize(SCREENS[1]);
    await openGame(page);
    await play(page);
    await freeze(page);
    await travel(page, 'palace-ballroom', 'from-music');
    await button(page).click();
    await untilArrived(page, 'palace-garden');
    const [spawn, leader] = await page.evaluate(() => {
      const w = window.__ua!.controller.world;
      const door = w.map.spawns.find((s) => s.spawnId === 'from-palace')!.points[0]!;
      const lead = w.unicorns.wildstar!.pos;
      return [door, lead] as const;
    });
    expect(Math.hypot(leader.x - spawn.x, leader.y - spawn.y)).toBeLessThan(80);
  });

  test('is not in the forest, where the child can walk where they like', async ({ page }) => {
    await page.setViewportSize(SCREENS[1]);
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 0.6);
    expect(await mapId(page)).toBe('forest');
    await expect(button(page)).toBeHidden();
  });

  for (const screen of SCREENS)
    test(`is big enough to hit and clear of everything else at ${screen.width} by ${screen.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(screen);
      await openGame(page);
      await play(page);
      await freeze(page);
      await travel(page, 'palace-gallery', 'from-hall');
      await expect(button(page)).toBeVisible();
      const box = (await button(page).boundingBox())!;
      expect(box.height, 'tall enough for a finger').toBeGreaterThanOrEqual(44);
      expect(box.width, 'wide enough for a finger').toBeGreaterThanOrEqual(44);
      expect(box.x, 'inside on the left').toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, 'inside at the bottom').toBeLessThanOrEqual(screen.height);
      expect(box.x + box.width, 'in the left half').toBeLessThan(screen.width / 2);
      const others = await page.evaluate(() => {
        const a = document.querySelector('.way-out')!.getBoundingClientRect();
        return [...document.querySelectorAll('#ui button, #ui [role="button"]')]
          .filter((el) => !el.classList.contains('way-out') && !el.closest('[hidden]'))
          .map((el) => el.getBoundingClientRect())
          .filter((b) => b.width > 0 && b.height > 0)
          .filter((b) => b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top)
          .map((b) => `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`);
      });
      expect(others, 'nothing else on the screen sits on it').toEqual([]);
      await shot(page, `${SCRATCH}/way-out-${screen.width}x${screen.height}.png`);
    });
});
