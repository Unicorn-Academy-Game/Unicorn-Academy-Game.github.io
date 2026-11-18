import { expect, type Page, test } from '@playwright/test';
import {
  BOOT_MS,
  closeParent,
  GEAR,
  goTo,
  openGame,
  openParent,
  PARENT,
  play,
  SCRATCH,
  shot,
  watchConsole,
} from './helpers';

/** Starts a game with the controls reachable and the console watched. */
async function ready(page: Page): Promise<string[]> {
  const noise = watchConsole(page);
  await openGame(page);
  await play(page);
  return noise;
}

/**
 * Waits for the page to load again, which a swapped world makes it do, and for the game to be up.
 */
async function reloaded(page: Page, act: () => Promise<void>): Promise<void> {
  await Promise.all([page.waitForEvent('load', { timeout: 60_000 }), act()]);
  await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
}

const recruited = (page: Page) => page.evaluate(() => window.__ua!.controller.world.persistent.recruited);

/** Gives Wildstar a friend the way play does, and writes it to the device. */
const befriend = (page: Page) =>
  page.evaluate(async () => {
    const ua = window.__ua!;
    ua.controller.world.persistent.recruited.push('leaf');
    await ua.saves.flush(ua.controller.world);
  });

test.describe('getting into the parent controls', () => {
  test('a tap on the gear opens the controls, with nothing to hold', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: GEAR }).click();
    await expect(page.getByRole('dialog', PARENT)).toBeVisible();
    await shot(page, `${SCRATCH}/gear-open.png`);
  });

  test('a tap on the touch screen opens them too', async ({ page }) => {
    await ready(page);
    const box = (await page.getByRole('button', { name: GEAR }).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole('dialog', PARENT)).toBeVisible();
  });

  test('Enter on the gear opens it, and closing it with Escape puts focus back on the gear', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: GEAR }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', PARENT)).toBeVisible();
    await closeParent(page);
    await expect(page.getByRole('button', { name: GEAR })).toBeFocused();
  });

  test('closing the controls and tapping the gear again opens them again', async ({ page }) => {
    await ready(page);
    await openParent(page);
    await closeParent(page);
    await openParent(page);
  });

  test('Tab and Shift+Tab go round the controls and never reach the page behind', async ({ page }) => {
    await ready(page);
    await openParent(page);
    // Where focus is, as a position among the sheet's elements. -1 means it is not on one of them.
    const stop = () =>
      page.evaluate(() => {
        const sheet = document.querySelector('.parent-sheet')!;
        const at = document.activeElement;
        return at && at !== sheet && sheet.contains(at) ? [...sheet.querySelectorAll('*')].indexOf(at) : -1;
      });
    // Focus starts on the title. Going backwards from there wraps to the last control instead of
    // leaving.
    await page.keyboard.press('Shift+Tab');
    const last = await stop();
    expect(last, 'Shift+Tab from the title').toBeGreaterThan(-1);

    const ring: number[] = [];
    for (let press = 0; press < 40; press++) {
      await page.keyboard.press('Tab');
      const at = await stop();
      expect(at, `Tab press ${press}`).toBeGreaterThan(-1);
      if (ring.includes(at)) break;
      ring.push(at);
    }
    expect(ring.length, 'stops in one round').toBeGreaterThanOrEqual(5);
    expect(ring.at(-1), 'the round ends where Shift+Tab began').toBe(last);

    const back: number[] = [];
    for (let press = 0; press < ring.length; press++) {
      await page.keyboard.press('Shift+Tab');
      back.push(await stop());
    }
    expect(back, 'Shift+Tab visits the same stops the other way').toEqual([...ring].reverse());

    expect(
      await page.evaluate(() => document.querySelector<HTMLElement>('.hud')!.inert),
      'the buttons behind the sheet',
    ).toBe(true);
    await closeParent(page);
    expect(
      await page.evaluate(() => document.querySelector<HTMLElement>('.hud')!.inert),
      'the buttons after it closes',
    ).toBe(false);
  });

  test("Escape closes the controls after a press on the sheet's empty space", async ({ page }) => {
    await ready(page);
    await openParent(page);
    const sheet = (await page.locator('.parent-sheet').boundingBox())!;
    await page.mouse.click(sheet.x + sheet.width - 30, sheet.y + sheet.height - 8);
    await closeParent(page);
  });

  test('a tap on the dim area around the sheet closes it', async ({ page }) => {
    await ready(page);
    await openParent(page);
    await page.mouse.click(3, 3);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the game takes no taps while the controls are open, and takes them again after', async ({ page }) => {
    await ready(page);
    const at = () =>
      page.evaluate(() => ({
        ...window.__ua!.controller.world.unicorns.wildstar!.pos,
        input: window.__ua!.stage.scene.input.enabled,
      }));
    const before = await at();
    expect(before.input).toBe(true);
    await openParent(page);
    expect((await at()).input).toBe(false);
    // A tap on the sheet's own empty space goes nowhere, and certainly not to the world behind it.
    const sheet = (await page.locator('.parent-sheet').boundingBox())!;
    await page.mouse.click(sheet.x + sheet.width - 30, sheet.y + sheet.height - 8);
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog', PARENT)).toBeVisible();
    const after = await at();
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
    await page.getByRole('button', { name: 'Close parent controls' }).click();
    await expect.poll(async () => (await at()).input).toBe(true);
  });
});

test.describe('sound', () => {
  test('levels change at once, are kept, and the switches work', async ({ page }) => {
    const noise = await ready(page);
    await openParent(page);
    await page.getByLabel('Music', { exact: true }).fill('40');
    await expect.poll(() => page.evaluate(() => window.__ua!.settings.get().musicVolume)).toBe(0.4);
    await page.getByLabel('Effects', { exact: true }).fill('25');
    await expect.poll(() => page.evaluate(() => window.__ua!.settings.get().effectsVolume)).toBe(0.25);

    await page.getByRole('switch', { name: 'Gentler effects' }).click();
    await expect.poll(() => page.evaluate(() => window.__ua!.settings.get().reducedEffects)).toBe(true);
    await page.getByRole('switch', { name: 'Sound off' }).click();
    await expect.poll(() => page.evaluate(() => window.__ua!.settings.get().muted)).toBe(true);
    await shot(page, `${SCRATCH}/parent-sound.png`);

    await closeParent(page);
    await expect(page.getByRole('button', { name: 'Sound', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // They are written shortly after, and are what the next visit starts with.
    await expect
      .poll(() => page.evaluate(async () => (await window.__ua!.store!.settings()).musicVolume), { timeout: 10_000 })
      .toBe(0.4);
    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
    await page.getByRole('button', { name: 'Play' }).click({ force: true });
    await openParent(page);
    await expect(page.getByLabel('Music', { exact: true })).toHaveValue('40');
    await expect(page.getByLabel('Effects', { exact: true })).toHaveValue('25');
    await expect(page.getByRole('switch', { name: 'Sound off' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: 'Gentler effects' })).toHaveAttribute('aria-checked', 'true');
    expect(noise).toEqual([]);
  });

  test('the pages can be walked with the arrow keys', async ({ page }) => {
    await ready(page);
    await openParent(page);
    await page.getByRole('tab', { name: 'Sound' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('tab', { name: 'Play' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'How your child plays' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('tab', { name: 'Learning' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Learning', exact: true })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('tab', { name: 'Saving' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Saving', exact: true })).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByRole('heading', { name: 'Unicorn Academy', level: 3 })).toBeVisible();
    await page.keyboard.press('Home');
    await expect(page.getByRole('heading', { name: 'Sound and effects' })).toBeVisible();
  });
});

test.describe('saving', () => {
  test('says saved only after a save finished, and warns plainly when saving fails', async ({ page }) => {
    const noise = await ready(page);
    await page.evaluate(async () => {
      const ua = window.__ua!;
      await ua.saves.flush(ua.controller.world);
    });
    await openParent(page);
    await goTo(page, 'Saving');
    await expect(page.getByText('Saved on this device')).toBeVisible();
    await shot(page, `${SCRATCH}/parent-saving-ok.png`);
    await closeParent(page);

    // The device stops taking writes. The game goes on from memory.
    await page.evaluate(() => {
      const ua = window.__ua!;
      ua.store!.commit = () => Promise.reject(new Error('disk is full'));
      ua.controller.debugTeleport({ x: 1500, y: 2300 });
      ua.saves.request('map', ua.controller.world);
    });
    await expect(page.getByRole('button', { name: GEAR })).toHaveAttribute('data-attention', 'true');
    await openParent(page);
    await goTo(page, 'Saving');
    await expect(page.getByText('Progress is not being saved')).toBeVisible();
    await expect(page.getByText('Saved on this device')).toHaveCount(0);
    await shot(page, `${SCRATCH}/parent-saving-failed.png`);

    // The download holds the world on screen, which is newer than anything the device kept.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download a copy' }).click(),
    ]);
    const text = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8');
    const file = JSON.parse(text) as {
      app: string;
      format: number;
      save: { recruited: string[]; wildstar: { position: { x: number } } };
    };
    expect(file.app).toBe('unicorn-academy');
    expect(file.format).toBe(1);
    expect(file.save.recruited).toEqual(['wildstar']);
    expect(Math.round(file.save.wildstar.position.x)).toBeGreaterThan(1400);
    expect(download.suggestedFilename()).toMatch(/^unicorn-academy-\d{4}-\d{2}-\d{2}\.json$/);
    expect(noise.filter((n) => !/disk is full|did not finish|Failed to load resource/.test(n))).toEqual([]);
  });
});

test.describe('recovery', () => {
  test('start over keeps the old world, and going back to it brings the friend home', async ({ page }) => {
    const noise = await ready(page);
    await befriend(page);
    expect(await recruited(page)).toEqual(['wildstar', 'leaf']);

    await openParent(page);
    await goTo(page, 'Recovery');
    await expect(page.getByText('2 unicorns, 1 place visited')).toBeVisible();
    await page.getByRole('button', { name: 'Start over…' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Start a brand-new world?' })).toBeVisible();
    await shot(page, `${SCRATCH}/parent-start-over.png`);
    // The answer with the focus is the safe one.
    await expect(page.getByRole('button', { name: 'Keep my world' })).toBeFocused();

    await page.getByRole('button', { name: 'Keep my world' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(await recruited(page)).toEqual(['wildstar', 'leaf']);

    await page.getByRole('button', { name: 'Start over…' }).click();
    await reloaded(page, () => page.getByRole('button', { name: 'Start over', exact: true }).click());
    expect(await recruited(page)).toEqual(['wildstar']);
    expect(await page.evaluate(async () => (await window.__ua!.store!.backups()).map((b) => b.reason))).toEqual([
      'Before starting over',
    ]);

    await page.getByRole('button', { name: 'Play' }).click({ force: true });
    await openParent(page);
    await goTo(page, 'Recovery');
    await expect(page.getByText('Before starting over')).toBeVisible();
    await shot(page, `${SCRATCH}/parent-recovery-shelf.png`);
    await page.getByRole('button', { name: 'Use this copy' }).first().click();
    await expect(page.getByRole('alertdialog', { name: 'Go back to this copy?' })).toBeVisible();
    await reloaded(page, () => page.getByRole('button', { name: 'Go back to this copy' }).click());
    expect(await recruited(page)).toEqual(['wildstar', 'leaf']);
    expect(noise).toEqual([]);
  });

  test('a downloaded copy can be loaded back, and a file that is not a world is refused with a reason', async ({
    page,
  }) => {
    const noise = await ready(page);
    await befriend(page);
    await openParent(page);
    await goTo(page, 'Recovery');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download a copy' }).first().click(),
    ]);
    const path = (await download.path())!;

    // Start fresh so there is something to bring back.
    await page.getByRole('button', { name: 'Start over…' }).click();
    await reloaded(page, () => page.getByRole('button', { name: 'Start over', exact: true }).click());
    expect(await recruited(page)).toEqual(['wildstar']);
    await page.getByRole('button', { name: 'Play' }).click({ force: true });
    await openParent(page);
    await goTo(page, 'Recovery');

    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
    await expect(page.getByText('That file cannot be used')).toBeVisible();
    await expect(page.getByText('That file is not a saved world from this game.')).toBeVisible();
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('not json at all') });
    await expect(page.getByText('That file is not a saved world. It could not be read.')).toBeVisible();
    await shot(page, `${SCRATCH}/parent-file-refused.png`);

    await page.locator('input[type=file]').setInputFiles(path);
    await expect(page.getByText('This file holds a world')).toBeVisible();
    await expect(page.getByText(/2 unicorns/).first()).toBeVisible();
    await shot(page, `${SCRATCH}/parent-file-preview.png`);
    await page.getByRole('button', { name: 'Use this world' }).click();
    await reloaded(page, () => page.getByRole('button', { name: 'Use this world' }).last().click());
    expect(await recruited(page)).toEqual(['wildstar', 'leaf']);
    expect(noise).toEqual([]);
  });
});

test.describe('the rest of the controls', () => {
  test('the offline and about pages say what is true of this build', async ({ page }) => {
    await ready(page);
    await openParent(page);
    await goTo(page, 'Offline');
    await expect(page.getByText('Offline play is not available here')).toBeVisible();
    await expect(page.getByText('Add to Home Screen', { exact: true })).toBeVisible();
    await goTo(page, 'About');
    await expect(page.getByText('Unicorn Academy').first()).toBeVisible();
    await expect(page.getByText('1.0.0').first()).toBeVisible();
    await expect(page.getByText('unofficial fan game')).toBeVisible();
    await page.getByRole('button', { name: 'Show the notices' }).click();
    await expect(page.locator('pre.notices')).toContainText('phaser 4.2.1');
    await expect(page.locator('pre.notices')).toContainText('SIL OPEN FONT LICENSE');
    await shot(page, `${SCRATCH}/parent-about.png`);
  });
});
