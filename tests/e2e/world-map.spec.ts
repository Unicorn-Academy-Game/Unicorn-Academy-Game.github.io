import { expect, type Page, test } from '@playwright/test';
import { ISLAND_PINS, PALACE_SPOTS } from '../../src/content/world-map';
import { freeze, mapId, openGame, play, SCRATCH, shot, step } from './helpers';

/** A phone held sideways, and one held upright: the two shapes the map is drawn for. */
const SIDEWAYS = { width: 863, height: 360 };
const UPRIGHT = { width: 390, height: 780 };

const mapButton = (page: Page) => page.getByRole('button', { name: 'Map', exact: true });
const theMap = (page: Page) => page.getByRole('dialog', { name: 'Map of the island' });

async function begin(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await openGame(page);
  await play(page);
  await freeze(page);
  await step(page, 0.5);
}

/** A place's button, named the way a screen reader reads it. */
const placeButton = (page: Page, spot: { label: string; opens?: string }) =>
  theMap(page).getByRole('button', { name: spot.opens ? `${spot.label}, its rooms` : spot.label, exact: true });

/** Waits for a change of place to finish, which takes the real clock: it fades and fetches. */
async function arrives(page: Page, map: string): Promise<void> {
  await page.waitForFunction(
    (id) => window.__ua!.controller.world.map.id === id && window.__ua!.controller.phase === 'playing',
    map,
    { polling: 200, timeout: 30_000 },
  );
  await step(page, 1.5);
}

/** Opens the map the way a child does, with a finger on the button on the screen. */
async function openMap(page: Page): Promise<void> {
  await mapButton(page).click();
  await expect(theMap(page)).toBeVisible();
}

test.describe('the map of the island', () => {
  test('opens from the screen, shows every place inside its picture, and takes the child to the beach', async ({
    page,
  }) => {
    await begin(page, SIDEWAYS);
    await openMap(page);
    const box = (await theMap(page).boundingBox())!;
    for (const pin of ISLAND_PINS) {
      const button = placeButton(page, pin);
      await expect(button, pin.label).toBeVisible();
      const at = (await button.boundingBox())!;
      expect(at.x, `${pin.label} left`).toBeGreaterThanOrEqual(box.x - 1);
      expect(at.y, `${pin.label} top`).toBeGreaterThanOrEqual(box.y - 1);
      expect(at.x + at.width, `${pin.label} right`).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(at.y + at.height, `${pin.label} bottom`).toBeLessThanOrEqual(box.y + box.height + 1);
      expect(Math.min(at.width, at.height), `${pin.label} is big enough to hit`).toBeGreaterThanOrEqual(36);
    }
    await shot(page, `${SCRATCH}/world-map-island.png`);

    await theMap(page).getByRole('button', { name: 'Beach' }).click();
    await expect(theMap(page)).toHaveCount(0);
    await arrives(page, 'beach');
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    // The world is awake again: she can be sent walking and the clock moves.
    const before = await page.evaluate(() => window.__ua!.controller.world.time);
    await step(page, 1);
    expect(await page.evaluate(() => window.__ua!.controller.world.time)).toBeGreaterThan(before);
  });

  test('keeps the palace to one pin that opens its rooms, and a room is one tap away', async ({ page }) => {
    await begin(page, SIDEWAYS);
    await openMap(page);
    await placeButton(page, { label: 'Palace', opens: 'palace' }).click();
    for (const room of PALACE_SPOTS) {
      await expect(theMap(page).getByRole('button', { name: room.label }), room.label).toBeVisible();
    }
    await shot(page, `${SCRATCH}/world-map-palace.png`);
    await theMap(page).getByRole('button', { name: 'Back to the island' }).click();
    await expect(theMap(page).getByRole('button', { name: 'Forest' })).toBeVisible();
    await placeButton(page, { label: 'Palace', opens: 'palace' }).click();
    await theMap(page).getByRole('button', { name: 'Library' }).click();
    await arrives(page, 'palace-library');
  });

  test('shuts with the close button, with Escape and with a tap on the dark, and gives the game back each time', async ({
    page,
  }) => {
    await begin(page, SIDEWAYS);
    const start = await mapId(page);
    await openMap(page);
    await theMap(page).getByRole('button', { name: 'Close the map' }).click();
    await expect(theMap(page)).toHaveCount(0);
    await openMap(page);
    await page.keyboard.press('Escape');
    await expect(theMap(page)).toHaveCount(0);
    await openMap(page);
    await page.mouse.click(2, 2);
    await expect(theMap(page)).toHaveCount(0);
    expect(await mapId(page)).toBe(start);
    await expect(mapButton(page)).toBeFocused();
  });

  test('is a grid of buttons that fit a phone held upright', async ({ page }) => {
    await begin(page, UPRIGHT);
    await openMap(page);
    const box = (await theMap(page).boundingBox())!;
    for (const pin of ISLAND_PINS) {
      const button = placeButton(page, pin);
      await button.scrollIntoViewIfNeeded();
      const at = (await button.boundingBox())!;
      expect(at.x, `${pin.label} left`).toBeGreaterThanOrEqual(box.x - 1);
      expect(at.x + at.width, `${pin.label} right`).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(Math.min(at.width, at.height), `${pin.label} is big enough to hit`).toBeGreaterThanOrEqual(44);
    }
    await shot(page, `${SCRATCH}/world-map-upright.png`);
  });

  test('goes to every place on it and every room of the palace, and each one is a whole world', async ({ page }) => {
    test.setTimeout(600_000);
    await begin(page, SIDEWAYS);
    const spots = [...ISLAND_PINS.filter((p) => !p.opens), ...PALACE_SPOTS];
    for (const spot of spots) {
      await openMap(page);
      if (PALACE_SPOTS.includes(spot as (typeof PALACE_SPOTS)[number]))
        await placeButton(page, { label: 'Palace', opens: 'palace' }).click();
      await theMap(page).getByRole('button', { name: spot.label, exact: true }).click();
      await arrives(page, spot.to.mapId);
      expect(await page.evaluate(() => window.__ua!.invariants()), spot.label).toEqual([]);
    }
  });
});
