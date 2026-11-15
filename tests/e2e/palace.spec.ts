import { expect, type Page, test } from '@playwright/test';
import { freeze, openGame, type Pt, play, SCRATCH, shot, step } from './helpers';

/**
 * The door's approach, where the herd stands to open it. The banner hangs from the keep's rod above
 * it.
 */
const DOOR = { x: 1536, y: 1032 };
/** Points on the banner: the rod it hangs from at the top, and the letters across the middle. */
const BANNER_ROD = { x: 1536, y: 575 };
const BANNER_LETTERS = { x: 1536, y: 640 };
/** A phone held sideways, the screen the banner framing is for. */
const PHONE = { width: 863, height: 360 };

async function atTheDoor(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate(async (door) => {
    await window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' });
    window.__ua!.controller.debugTeleport(door);
  }, DOOR);
  await step(page, 6);
}

const screenOf = (page: Page, p: Pt) => page.evaluate((q) => window.__ua!.controller.toScreen(q), p);

test.describe('the palace', () => {
  test('shows the palace banner and the leader together on a phone held sideways', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await atTheDoor(page);
    const size = page.viewportSize()!;
    const rod = await screenOf(page, BANNER_ROD);
    const letters = await screenOf(page, BANNER_LETTERS);
    const feet = await screenOf(page, DOOR);
    await shot(page, `${SCRATCH}/palace-door-phone.png`);

    expect(rod.y).toBeGreaterThanOrEqual(0);
    expect(letters.y).toBeGreaterThan(rod.y);
    expect(feet.y).toBeLessThanOrEqual(size.height - 20);
    expect(feet.y).toBeGreaterThan(letters.y);
    // The herd's leader is still the right size: a unicorn body is 114 units tall and should not
    // drop under about 80 px.
    const head = await screenOf(page, { x: DOOR.x, y: DOOR.y - 114 });
    expect(feet.y - head.y).toBeGreaterThanOrEqual(79);
  });

  test('leaves the camera on the herd when the screen is tall enough to hold both anyway', async ({ page }) => {
    await atTheDoor(page);
    await page.setViewportSize({ width: 900, height: 900 });
    await step(page, 1);
    const rod = await screenOf(page, BANNER_ROD);
    const feet = await screenOf(page, DOOR);
    await shot(page, `${SCRATCH}/palace-door-tall.png`);
    expect(rod.y).toBeGreaterThanOrEqual(0);
    expect(feet.y).toBeLessThanOrEqual(900);
    // Centred on her body, with nothing lifted or pulled back. A world unit is not always a CSS
    // pixel, so the body is found on screen.
    const body = await screenOf(page, { x: DOOR.x, y: DOOR.y - 52 });
    expect(Math.abs(body.y - 450)).toBeLessThan(6);
  });

  test('does not pull the camera back for the banner when reduced effects are on', async ({ page }) => {
    await atTheDoor(page);
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await step(page, 10);
    const rod = await screenOf(page, BANNER_ROD);
    await shot(page, `${SCRATCH}/palace-door-calm.png`);
    expect(rod.y).toBeLessThan(0);
    const body = await screenOf(page, { x: DOOR.x, y: DOOR.y - 52 });
    expect(Math.abs(body.y - page.viewportSize()!.height / 2)).toBeLessThan(6);
  });

  test('is the same size everywhere else: away from the door, and in a place with no banner', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await atTheDoor(page);
    const bodyPx = async (feet: Pt): Promise<number> => {
      const at = await screenOf(page, feet);
      const head = await screenOf(page, { x: feet.x, y: feet.y - 114 });
      return at.y - head.y;
    };
    const atDoor = await bodyPx(DOOR);

    await page.evaluate(() => window.__ua!.controller.debugTeleport({ x: 1536, y: 1700 }));
    await step(page, 10);
    const away = await bodyPx({ x: 1536, y: 1700 });
    // On a high-density phone the picture is already drawn a little smaller, so the pull-back at
    // the door has less to give back.
    expect(away).toBeGreaterThan(atDoor + 4);

    await page.evaluate(async () => window.__ua!.controller.travel({ mapId: 'forest', spawnId: 'from-garden' }));
    await step(page, 1);
    const leader = await page.evaluate(() => window.__ua!.controller.world.unicorns.wildstar!.pos);
    expect(await bodyPx(leader)).toBeCloseTo(away, 0);
  });
});
