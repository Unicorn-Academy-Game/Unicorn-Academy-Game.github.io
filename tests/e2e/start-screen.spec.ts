import { expect, type Page, test } from '@playwright/test';
import { audioStats, BOOT_MS, befriendLeaf, freeze, mapId, openGame, play } from './helpers';

/**
 * The start screen has three switches: start from scratch (default no), learning mode (default yes)
 * and where to begin (default the forest). The place switch changes the world behind the title as
 * it is tapped. The scratch switch changes how the page opens, so it opens again.
 */

const scratch = (page: Page) => page.getByRole('radiogroup', { name: 'Start from scratch' });
const learning = (page: Page) => page.getByRole('radiogroup', { name: 'Learning mode' });
const place = (page: Page) => page.getByRole('radiogroup', { name: 'Start at' });
const lit = async (group: ReturnType<typeof scratch>): Promise<string> =>
  (await group.getByRole('radio', { checked: true }).innerText()).trim();

const booted = (page: Page) =>
  page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });

const onDisk = (page: Page) =>
  page.evaluate(async () => {
    const { store } = window.__ua!;
    const current = await store!.current();
    return { friends: current?.save.recruited ?? null, settings: await store!.settings() };
  });

test.describe('the start screen', () => {
  test.setTimeout(240_000);

  test('opens with no, yes and the forest', async ({ page }) => {
    await openGame(page, 'setting', '', { learning: true });
    expect(await lit(scratch(page))).toBe('No');
    expect(await lit(learning(page))).toBe('Yes');
    expect(await lit(place(page))).toBe('Forest');
    expect(await mapId(page)).toBe('forest');
    expect(await page.evaluate(() => window.__ua!.visit)).toBe('kept');
    const settings = await page.evaluate(() => window.__ua!.settings.get());
    expect(settings).toMatchObject({ startFresh: false, startPlace: 'forest', learning: { on: true } });
  });

  test('keeps every switch, the line and Play on the screen without any of them covering another', async ({ page }) => {
    await openGame(page, 'setting', '', { learning: true });
    const size = page.viewportSize()!;
    const boxes = [];
    for (const [name, locator] of [
      ['scratch', scratch(page)],
      ['learning', learning(page)],
      ['place', place(page)],
      ['play', page.getByRole('button', { name: 'Play' })],
    ] as const) {
      const box = (await locator.boundingBox())!;
      expect(box, name).not.toBeNull();
      expect(box.x, `${name} left`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${name} right`).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height, `${name} bottom`).toBeLessThanOrEqual(size.height);
      boxes.push({ name, box });
    }
    // Each is at least as big as a finger.
    for (const { name, box } of boxes)
      expect(box.height, `${name} is tall enough to tap`).toBeGreaterThanOrEqual(name === 'play' ? 56 : 28);
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const apart =
          a.box.x + a.box.width <= b.box.x + 1 ||
          b.box.x + b.box.width <= a.box.x + 1 ||
          a.box.y + a.box.height <= b.box.y + 1 ||
          b.box.y + b.box.height <= a.box.y + 1;
        expect(apart, `${a.name} and ${b.name} do not overlap`).toBe(true);
      }
    }
  });

  test('puts the place the player picks on the screen behind it, and begins the game there', async ({ page }) => {
    await openGame(page, 'setting');
    await place(page).getByRole('radio', { name: 'Palace' }).click();
    await expect.poll(() => mapId(page), { timeout: 60_000 }).toBe('palace-garden');
    expect(await lit(place(page))).toBe('Palace');
    expect(await page.evaluate(() => window.__ua!.controller.phase)).toBe('title');
    await place(page).getByRole('radio', { name: 'Forest' }).click();
    await expect.poll(() => mapId(page), { timeout: 60_000 }).toBe('forest');

    await place(page).getByRole('radio', { name: 'Palace' }).click();
    await play(page);
    expect(await mapId(page)).toBe('palace-garden');
    expect(await page.evaluate(() => window.__ua!.controller.world.persistent.recruited)).toContain('wildstar');
  });

  test('lets a touch through to the world from the moment Play is pressed, and not to the switches that are fading out', async ({
    page,
  }) => {
    await openGame(page, 'setting');
    // The title takes half a second to fade, and the switches stay in the page for all of it. Asked
    // in the same task as the press, so that no timer has had a chance to take the title away, and
    // a finger in that half second is read by the world and not by a switch the player cannot see.
    const under = await page.evaluate(() => {
      const switchBox = document.querySelector<HTMLElement>('.title [role="radiogroup"]')!.getBoundingClientRect();
      document.querySelector<HTMLElement>('.title .play')!.click();
      return document.elementFromPoint(switchBox.x + switchBox.width / 2, switchBox.y + switchBox.height / 2)?.tagName;
    });
    expect(under).toBe('CANVAS');
    await play(page);
  });

  test('settles on the last of a quick run of taps', async ({ page }) => {
    await openGame(page, 'setting');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const radio = (name: string) => place(page).getByRole('radio', { name });
    await radio('Palace').click();
    await radio('Forest').click();
    await radio('Palace').click();
    await expect.poll(() => mapId(page), { timeout: 90_000 }).toBe('palace-garden');
    await page.waitForTimeout(1500);
    expect(await mapId(page)).toBe('palace-garden');
    expect(await lit(place(page))).toBe('Palace');
    expect(errors).toEqual([]);
  });

  test('begins in the place that is still coming in when Play is pressed, and wakes the sound', async ({ page }) => {
    await openGame(page, 'setting');
    expect((await audioStats(page)).state).toBe('idle');
    await place(page).getByRole('radio', { name: 'Palace' }).click();
    await play(page);
    expect(await mapId(page)).toBe('palace-garden');
    await expect.poll(async () => (await audioStats(page)).state, { timeout: 30_000 }).toBe('running');
  });

  test('remembers the place, begins a new visit there with the friends she has, and carries a reload on where she stood', async ({
    page,
    context,
  }) => {
    await openGame(page, 'setting');
    await play(page);
    await freeze(page);
    await befriendLeaf(page);
    await page.evaluate(() => window.__ua!.saves.flush(window.__ua!.controller.world));
    expect((await onDisk(page)).friends).toEqual(['wildstar', 'leaf']);
    await page.close();

    const next = await context.newPage();
    await openGame(next, 'setting');
    expect(await mapId(next)).toBe('forest');
    await place(next).getByRole('radio', { name: 'Palace' }).click();
    await expect.poll(() => mapId(next), { timeout: 60_000 }).toBe('palace-garden');
    expect(await next.evaluate(() => window.__ua!.controller.world.persistent.recruited)).toEqual(['wildstar', 'leaf']);
    await next.evaluate(() => window.__ua!.settings.flush());
    await play(next);
    await next.evaluate(() => window.__ua!.saves.flush(window.__ua!.controller.world));

    // A reload in the middle of the game carries on where she stood.
    await next.reload();
    await booted(next);
    expect(await mapId(next)).toBe('palace-garden');
    expect(await lit(place(next))).toBe('Palace');
    await next.close();

    // A new page begins at the place the player chose, not where the world was saved.
    const third = await context.newPage();
    await openGame(third, 'setting');
    expect(await mapId(third)).toBe('palace-garden');
    expect(await lit(place(third))).toBe('Palace');
    expect((await onDisk(third)).settings.startPlace).toBe('palace');
  });

  test('turns learning on and off at once, and keeps the choice', async ({ page }) => {
    await openGame(page, 'setting', '', { learning: true });
    await learning(page).getByRole('radio', { name: 'No' }).click();
    expect(await page.evaluate(() => window.__ua!.settings.get().learning.on)).toBe(false);
    expect(await lit(learning(page))).toBe('No');
    await page.evaluate(() => window.__ua!.settings.flush());
    await page.reload();
    await booted(page);
    expect(await lit(learning(page))).toBe('No');
    await learning(page).getByRole('radio', { name: 'Yes' }).click();
    expect(await page.evaluate(() => window.__ua!.settings.get().learning.on)).toBe(true);
  });

  test('flips a switch with a tap on either side of it', async ({ page }) => {
    await openGame(page, 'setting', '', { learning: true });
    // The lit side is tapped as often as the other, so a tap on it turns the switch over.
    await learning(page).getByRole('radio', { name: 'Yes' }).click();
    expect(await lit(learning(page))).toBe('No');
    await learning(page).getByRole('radio', { name: 'No' }).click();
    expect(await lit(learning(page))).toBe('Yes');
  });

  test('can be worked with a keyboard: Tab to a switch, arrows to change it', async ({ page }) => {
    await openGame(page, 'setting', '', { learning: true });
    const yes = learning(page).getByRole('radio', { name: 'Yes' });
    await yes.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(learning(page).getByRole('radio', { name: 'No' })).toBeFocused();
    expect(await lit(learning(page))).toBe('No');
    await page.keyboard.press('ArrowRight');
    await expect(yes).toBeFocused();
    expect(await lit(learning(page))).toBe('Yes');
    // One stop for Tab in each switch: the lit side.
    expect(
      await learning(page)
        .getByRole('radio')
        .evaluateAll((all) => all.map((r) => (r as HTMLElement).tabIndex)),
    ).toEqual([-1, 0]);
  });

  test('starting from scratch opens the game again as a visit that leaves the saved world alone, and switching it off brings the world back', async ({
    page,
    context,
  }) => {
    await openGame(page, 'setting');
    await play(page);
    await freeze(page);
    await befriendLeaf(page);
    await page.evaluate(() => window.__ua!.saves.flush(window.__ua!.controller.world));
    expect((await onDisk(page)).friends).toEqual(['wildstar', 'leaf']);
    await page.close();

    const visit = await context.newPage();
    await openGame(visit, 'setting');
    expect(
      await visit.evaluate(() => ({
        visit: window.__ua!.visit,
        friends: window.__ua!.controller.world.persistent.recruited,
      })),
    ).toEqual({ visit: 'kept', friends: ['wildstar', 'leaf'] });
    await scratch(visit).getByRole('radio', { name: 'Yes' }).click();
    await visit.waitForFunction(() => window.__ua === undefined || window.__ua.visit === 'fresh', undefined, {
      timeout: BOOT_MS,
    });
    await booted(visit);
    await visit.getByRole('button', { name: 'Play' }).waitFor();
    expect(
      await visit.evaluate(() => ({
        visit: window.__ua!.visit,
        friends: window.__ua!.controller.world.persistent.recruited,
      })),
    ).toEqual({ visit: 'fresh', friends: ['wildstar'] });
    expect(await lit(scratch(visit))).toBe('Yes');
    expect((await onDisk(visit)).friends).toEqual(['wildstar', 'leaf']);

    await scratch(visit).getByRole('radio', { name: 'No' }).click();
    await visit.waitForFunction(() => window.__ua === undefined || window.__ua.visit === 'kept', undefined, {
      timeout: BOOT_MS,
    });
    await booted(visit);
    await visit.getByRole('button', { name: 'Play' }).waitFor();
    expect(
      await visit.evaluate(() => ({
        visit: window.__ua!.visit,
        friends: window.__ua!.controller.world.persistent.recruited,
      })),
    ).toEqual({ visit: 'kept', friends: ['wildstar', 'leaf'] });
    expect(await lit(scratch(visit))).toBe('No');
  });

  test('an address that asks for a visit still shows what the visit is, and the switch undoes it', async ({ page }) => {
    await openGame(page, 'fresh');
    expect(await lit(scratch(page))).toBe('Yes');
    await scratch(page).getByRole('radio', { name: 'No' }).click();
    await page.waitForFunction(() => window.__ua === undefined || window.__ua.visit === 'kept', undefined, {
      timeout: BOOT_MS,
    });
    await booted(page);
    expect(await page.evaluate(() => window.__ua!.visit)).toBe('kept');
    expect(page.url()).not.toContain('fresh');
  });

  test('a look around has nothing to start over, so the switch is not there, and the other two are', async ({
    page,
  }) => {
    await openGame(page, 'incognito', '', { learning: true });
    await expect(scratch(page)).toHaveCount(0);
    await expect(learning(page)).toBeVisible();
    await expect(place(page)).toBeVisible();
    await place(page).getByRole('radio', { name: 'Palace' }).click();
    await expect.poll(() => mapId(page), { timeout: 60_000 }).toBe('palace-garden');
    // Nothing of it is kept.
    expect(await page.evaluate(async () => (await window.__ua!.store!.settings()).startPlace)).toBe('forest');
  });
});
