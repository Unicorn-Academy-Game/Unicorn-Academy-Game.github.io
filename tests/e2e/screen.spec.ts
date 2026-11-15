import { expect, type Page, test } from '@playwright/test';
import {
  bodyOf,
  closeParent,
  freeze,
  goTo,
  hush,
  openGame,
  openParent,
  PARENT,
  play,
  SCRATCH,
  shot,
  step,
  stepUntil,
  tapWorld,
} from './helpers';

/**
 * What the page shows, which a parent sees when a window is dragged larger or a phone is turned.
 */
const SIZES = [
  { name: 'a window made square', width: 900, height: 900 },
  { name: 'a phone held upright', width: 390, height: 844 },
  { name: 'a desktop window', width: 1280, height: 720 },
  { name: 'a phone held sideways again', width: 863, height: 360 },
];

const canvasBox = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: Math.round(r.width), h: Math.round(r.height) };
  });

test('the picture fills the window and takes taps in the right place after every resize', async ({ page }) => {
  await openGame(page);
  await play(page);
  await freeze(page);
  // A tap on her is the assertion, so no butterfly may drift across it.
  await hush(page);
  await step(page, 1);

  for (const size of SIZES) {
    await test.step(size.name, async () => {
      await page.setViewportSize({ width: size.width, height: size.height });
      // A resize reaches the picture on the next frame, so the page is asked rather than assumed.
      await expect
        .poll(() => canvasBox(page), { timeout: 45_000, intervals: [100, 250] })
        .toEqual({ x: 0, y: 0, w: size.width, h: size.height });
      await step(page, 1);

      // Wildstar's body is in the middle of what is shown, so the camera knows the new size too.
      const body = await bodyOf(page, 'wildstar');
      const at = await page.evaluate((p) => window.__ua!.controller.toScreen(p), body);
      expect(Math.abs(at.x - size.width / 2)).toBeLessThan(4);
      expect(Math.abs(at.y - size.height / 2)).toBeLessThan(4);

      // And a finger on her lands on her. A picture drawn at the wrong size would take the tap
      // somewhere else.
      await tapWorld(page, body);
      await step(page, 0.4);
      expect(await page.evaluate(() => window.__ua!.controller.world.unicorns.wildstar!.state.kind)).toBe('casting');
      await stepUntil(
        page,
        'Wildstar to finish her spell',
        () => window.__ua!.controller.world.unicorns.wildstar!.state.kind === 'leading',
        10,
      );
    });
  }
});

test('the picture is put right when a phone is turned over and back while the page is too slow to look in between', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'only a phone has a way up to turn over');
  test.setTimeout(300_000);
  await openGame(page);
  await play(page);
  await hush(page);
  const shape = page.viewportSize()!;
  // The page is made thirty times slower, as a tablet is that is busy drawing. It is still at the
  // first turn when the second comes, and the browser says that the phone has turned back while the
  // window still has the shape that it had turned to.
  const slow = await page.context().newCDPSession(page);
  await slow.send('Emulation.setCPUThrottlingRate', { rate: 30 });
  await page.setViewportSize({ width: shape.height, height: shape.width });
  await page.waitForTimeout(1800);
  await page.setViewportSize(shape);
  await expect
    .poll(() => canvasBox(page), { timeout: 90_000, intervals: [250, 500] })
    .toEqual({ x: 0, y: 0, w: shape.width, h: shape.height });
  await slow.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

/**
 * How many pixels of the page a hundred units of the world take, which is how large everything is
 * drawn.
 */
const pixelsPerHundred = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const { controller } = window.__ua!;
    return controller.toScreen({ x: 1100, y: 1000 }).x - controller.toScreen({ x: 1000, y: 1000 }).x;
  });

const zoomStep = (page: Page, label: string) => page.getByRole('radio', { name: label });

test('the zoom a parent picks makes the world larger or smaller, and is still picked the next time', async ({
  page,
  context,
}) => {
  // Two visits, each a full load of the game in a browser that draws in software.
  test.setTimeout(300_000);
  await openGame(page);
  await play(page);
  await freeze(page);
  await step(page, 1);
  const usual = await pixelsPerHundred(page);

  await openParent(page);
  await goTo(page, 'Play');
  await expect(zoomStep(page, '100%')).toHaveAttribute('aria-checked', 'true');
  await zoomStep(page, '150%').click();
  await expect(zoomStep(page, '150%')).toHaveAttribute('aria-checked', 'true');
  await expect(zoomStep(page, '100%')).toHaveAttribute('aria-checked', 'false');
  await shot(page, `${SCRATCH}/zoom-setting.png`);
  await closeParent(page);
  await step(page, 1);

  expect((await pixelsPerHundred(page)) / usual).toBeCloseTo(1.5, 2);
  // Closer does not push her off the middle of the picture.
  const body = await bodyOf(page, 'wildstar');
  const at = await page.evaluate((p) => window.__ua!.controller.toScreen(p), body);
  const size = page.viewportSize()!;
  expect(Math.abs(at.x - size.width / 2)).toBeLessThan(4);
  expect(Math.abs(at.y - size.height / 2)).toBeLessThan(4);
  await shot(page, `${SCRATCH}/zoom-150.png`);

  await openParent(page);
  await goTo(page, 'Play');
  await zoomStep(page, '75%').click();
  await closeParent(page);
  await step(page, 1);
  expect((await pixelsPerHundred(page)) / usual).toBeCloseTo(0.75, 2);
  await shot(page, `${SCRATCH}/zoom-075.png`);

  await openParent(page);
  await goTo(page, 'Play');
  await zoomStep(page, '200%').click();
  await closeParent(page);
  await page.evaluate(() => window.__ua!.settings.flush());
  await page.close();

  // A new visit opens at the zoom she left, and the controls show it.
  const again = await context.newPage();
  await openGame(again);
  expect((await again.evaluate(() => window.__ua!.settings.get())).zoom).toBe(2);
  await play(again);
  await freeze(again);
  await step(again, 1);
  expect((await pixelsPerHundred(again)) / usual).toBeCloseTo(2, 2);
  await openParent(again);
  await goTo(again, 'Play');
  await expect(zoomStep(again, '200%')).toHaveAttribute('aria-checked', 'true');
});

test('the arrow keys move between the zoom steps and pick as they go', async ({ page }) => {
  await openGame(page);
  await play(page);
  await openParent(page);
  await goTo(page, 'Play');
  await zoomStep(page, '100%').focus();
  await page.keyboard.press('ArrowRight');
  await expect(zoomStep(page, '125%')).toBeFocused();
  await expect(zoomStep(page, '125%')).toHaveAttribute('aria-checked', 'true');
  expect((await page.evaluate(() => window.__ua!.settings.get())).zoom).toBe(1.25);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(zoomStep(page, '75%')).toHaveAttribute('aria-checked', 'true');
  // From the first step the next one back goes round to the last.
  await page.keyboard.press('ArrowLeft');
  await expect(zoomStep(page, '200%')).toHaveAttribute('aria-checked', 'true');
});

const isFullscreen = (page: Page): Promise<boolean> =>
  page.evaluate(() => (document.fullscreenElement ?? null) !== null);

test.describe('full screen', () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page);
    await play(page);
    test.skip(
      !(await page.evaluate(() => document.fullscreenEnabled === true)),
      'this browser does not show pages full screen',
    );
  });

  test('the button goes full screen and comes back, and follows however full screen ends', async ({ page }) => {
    const enter = page.getByRole('button', { name: 'Full screen', exact: true });
    await expect(enter).toBeVisible();
    await shot(page, `${SCRATCH}/hud-fullscreen.png`);
    await enter.click();
    await expect.poll(() => isFullscreen(page)).toBe(true);
    const leave = page.getByRole('button', { name: 'Leave full screen' });
    await expect(leave).toHaveAttribute('aria-pressed', 'true');
    await leave.click();
    await expect.poll(() => isFullscreen(page)).toBe(false);
    await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // The browser can end it too, as the Escape key does. The button must not be left saying the
    // wrong thing.
    await page.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect.poll(() => isFullscreen(page)).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toBeVisible();
  });

  test('the F key does the same, and not while the parent controls are open', async ({ page }) => {
    await page.keyboard.press('f');
    await expect.poll(() => isFullscreen(page)).toBe(true);
    await page.keyboard.press('f');
    await expect.poll(() => isFullscreen(page)).toBe(false);

    await openParent(page);
    await page.keyboard.press('f');
    await page.waitForTimeout(400);
    expect(await isFullscreen(page)).toBe(false);
  });

  test('the Play page has a button for it that follows the state', async ({ page }) => {
    await openParent(page);
    await goTo(page, 'Play');
    // The round button on the game is still in the page behind the controls, so the controls are
    // searched alone.
    const controls = page.getByRole('dialog', PARENT);
    await controls.getByRole('button', { name: 'Go full screen' }).click();
    await expect.poll(() => isFullscreen(page)).toBe(true);
    await expect(controls.getByRole('button', { name: 'Leave full screen' })).toBeVisible();
    await controls.getByRole('button', { name: 'Leave full screen' }).click();
    await expect.poll(() => isFullscreen(page)).toBe(false);
    await expect(controls.getByRole('button', { name: 'Go full screen' })).toBeVisible();
  });
});
