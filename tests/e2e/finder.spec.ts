import { expect, type Page, test } from '@playwright/test';
import { befriend, FRIENDS, freeze, openGame, play, SCRATCH, shot } from './helpers';

const finder = (page: Page) => page.getByRole('group', { name: /unicorns found$/ });
const slot = (page: Page, id: string) => page.locator(`.finder-slot[data-unicorn="${id}"]`);

/**
 * Remembers every announcement as it goes up, since each one is gone again after a few seconds and
 * a slow page may look late.
 */
async function watchAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const heard: string[] = [];
    (window as unknown as { __announced: string[] }).__announced = heard;
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement && n.classList.contains('found-banner'))
            heard.push(`${n.querySelector('strong')?.textContent} / ${n.querySelector('span')?.textContent}`);
    }).observe(document.getElementById('ui')!, { childList: true });
  });
}

const announced = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __announced: string[] }).__announced);

/**
 * Makes every wait of a second or more last thirty times as long on this page, so a banner and its
 * confetti stay up for as long as a slow machine takes to draw and photograph them. Nothing else
 * about the page changes.
 */
const stretchTimers = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const real = window.setTimeout.bind(window);
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
      real(fn, (ms ?? 0) >= 1000 ? (ms ?? 0) * 30 : ms, ...args)) as typeof window.setTimeout;
  });

/**
 * Stops every animation on the page at one moment of its run, so a picture of something moving is
 * the same on any machine.
 */
const holdAnimationsAt = (page: Page, ms: number): Promise<void> =>
  page.evaluate((at) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = at;
    }
  }, ms);

test('a new world shows Wildstar found and five friends still hiding', async ({ page }) => {
  await openGame(page);
  await play(page);
  await expect(finder(page)).toBeVisible();
  await expect(finder(page)).toHaveAttribute('aria-label', '1 of 6 unicorns found');
  await expect(page.locator('.finder-slot')).toHaveCount(6);
  await expect(slot(page, 'wildstar')).toHaveAttribute('data-found', 'true');
  for (const id of FRIENDS) await expect(slot(page, id)).toHaveAttribute('data-found', 'false');
  await expect(page.locator('.finder-count')).toHaveText('5');
  await expect(page.locator('.finder-label')).toHaveText('unicorns left');
  // Each portrait is a real picture, not an empty frame.
  const sizes = await page
    .locator('.finder-slot img')
    .evaluateAll((all) => all.map((img) => (img as HTMLImageElement).naturalWidth));
  expect(sizes.every((w) => w > 20)).toBe(true);
  await page.waitForTimeout(600);
  await shot(page, `${SCRATCH}/finder-start.png`);
});

test('the counter fits across a phone held upright, and its words are inside it', async ({ page }) => {
  await openGame(page);
  await play(page);
  for (const [width, height] of [
    [320, 480],
    [320, 568],
    [360, 640],
    [390, 844],
    [414, 896],
    [768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    const box = (await finder(page).boundingBox())!;
    expect(box.x, `${width}x${height}: the counter starts on the screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${width}x${height}: the counter ends before the edge of the screen`).toBeLessThanOrEqual(
      width - 4,
    );
    const label = (await page.locator('.finder-label').boundingBox())!;
    expect(label.x + label.width, `${width}x${height}: the words are inside the counter`).toBeLessThanOrEqual(
      box.x + box.width,
    );
    for (const one of await page.locator('.finder-slot').all()) {
      const at = (await one.boundingBox())!;
      expect(at.width, `${width}x${height}: a portrait is big enough to see`).toBeGreaterThanOrEqual(28);
    }
  }
});

test('finding friends counts down and announces each one, and the last is a party', async ({ page }) => {
  test.setTimeout(480_000);
  await openGame(page);
  await play(page);
  await freeze(page);
  await watchAnnouncements(page);

  await befriend(page, 'leaf');
  await expect(page.locator('.finder-count')).toHaveText('4');
  await expect(slot(page, 'leaf')).toHaveAttribute('data-found', 'true');
  await expect(slot(page, 'glacier')).toHaveAttribute('data-found', 'false');
  await expect(finder(page)).toHaveAttribute('aria-label', '2 of 6 unicorns found');
  expect(await announced(page)).toEqual(['Leaf joined you! / 4 unicorns left to find']);

  for (const id of FRIENDS.slice(1, 4)) await befriend(page, id);
  await expect(page.locator('.finder-count')).toHaveText('1');
  await expect(page.locator('.finder-label')).toHaveText('unicorn left');

  // The counter leaves a few seconds after the party, and a slow page can be late to look, so this
  // test keeps it up.
  await stretchTimers(page);
  // Its timers are stretched, so the party that follows the last friend would not begin in this
  // test: it has its own.
  await befriend(page, 'storm', { party: false });
  await expect(finder(page)).toHaveAttribute('aria-label', '6 of 6 unicorns found');
  await expect(page.locator('.finder-label')).toHaveText('All found!');
  await expect(page.locator('.finder-count')).toBeHidden();
  await expect(page.locator('.finder')).toHaveAttribute('data-done', 'true');
  const all = await announced(page);
  expect(all).toHaveLength(5);
  expect(all.map((line) => line.split(' / ')[0])).toEqual([
    'Leaf joined you!',
    'Glacier joined you!',
    'River joined you!',
    'Cinder joined you!',
    'You found them all!',
  ]);
  expect(all.at(-1)).toBe('You found them all! / All 6 unicorns are together now');
});

test('what the counter looks like when a friend joins and when the last one does', async ({ page }) => {
  await openGame(page);
  await play(page);
  await freeze(page);
  await stretchTimers(page);
  await page.evaluate(() => window.__ua!.ui.unicornFound('leaf', ['wildstar', 'leaf']));
  await expect(page.locator('.found-banner')).toBeVisible();
  await holdAnimationsAt(page, 450);
  await shot(page, `${SCRATCH}/finder-pop.png`);

  await page.evaluate(() =>
    window.__ua!.ui.unicornFound('glacier', ['wildstar', 'leaf', 'glacier', 'river', 'cinder']),
  );
  await expect(page.locator('.found-banner')).toContainText('Glacier joined you!');
  await holdAnimationsAt(page, 700);
  await shot(page, `${SCRATCH}/finder-four.png`);
  // The row follows the list, not only the one who just joined: River and Cinder were found before
  // it was told about them.
  for (const id of ['wildstar', 'leaf', 'glacier', 'river', 'cinder'])
    await expect(slot(page, id)).toHaveAttribute('data-found', 'true');
  await expect(slot(page, 'storm')).toHaveAttribute('data-found', 'false');

  await page.evaluate(() =>
    window.__ua!.ui.unicornFound('storm', ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm']),
  );
  await expect(page.locator('.confetti i')).toHaveCount(48);
  await expect(page.locator('.found-banner[data-finale="true"]')).toBeVisible();
  for (const id of ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm'])
    await expect(slot(page, id)).toHaveAttribute('data-found', 'true');
  await holdAnimationsAt(page, 1600);
  await shot(page, `${SCRATCH}/finder-finale.png`);
});

test('the party has no confetti when the parent asked for fewer effects', async ({ page }) => {
  await openGame(page);
  await play(page);
  await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
  await page.evaluate(() =>
    window.__ua!.ui.unicornFound('storm', ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm']),
  );
  await expect(page.locator('.found-banner[data-finale="true"]')).toBeVisible();
  await expect(page.locator('.confetti')).toHaveCount(0);
});

test('a world that is carried on shows who is already found, without any fanfare', async ({ page, context }) => {
  test.setTimeout(360_000);
  await openGame(page);
  await play(page);
  await freeze(page);
  await befriend(page, 'leaf');
  await befriend(page, 'glacier');
  await page.evaluate(() => window.__ua!.saves.flush(window.__ua!.controller.world));
  await page.close();

  const again = await context.newPage();
  await openGame(again);
  await play(again);
  await expect(finder(again)).toHaveAttribute('aria-label', '3 of 6 unicorns found');
  await expect(slot(again, 'leaf')).toHaveAttribute('data-found', 'true');
  await expect(slot(again, 'glacier')).toHaveAttribute('data-found', 'true');
  await expect(slot(again, 'river')).toHaveAttribute('data-found', 'false');
  await expect(again.locator('.finder-count')).toHaveText('3');
  await expect(again.locator('.found-banner')).toHaveCount(0);
});

test('the counter goes away a few seconds after the last friend joins, and the banner and party still play first', async ({
  page,
}) => {
  await openGame(page);
  await play(page);
  await expect(page.locator('.finder')).toBeVisible();
  await page.evaluate(() =>
    window.__ua!.ui.unicornFound('storm', ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm']),
  );
  await expect(page.locator('.found-banner[data-finale="true"]')).toBeVisible();
  await expect(page.locator('.finder')).toBeVisible();
  await expect(page.locator('.finder-label')).toHaveText('All found!');
  await expect(page.locator('.finder')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.finder-slot')).toHaveCount(6);
  await expect(page.locator('.corner .finder')).toHaveCount(1);
});

test('a world where everyone is already found carries on with no counter at all', async ({ page, context }) => {
  await openGame(page);
  await play(page);
  await page.evaluate(() => {
    const persistent = window.__ua!.controller.world.persistent;
    persistent.recruited.splice(
      0,
      persistent.recruited.length,
      'wildstar',
      'leaf',
      'glacier',
      'river',
      'cinder',
      'storm',
    );
  });
  await page.evaluate(() => window.__ua!.saves.flush(window.__ua!.controller.world));
  await page.close();

  const again = await context.newPage();
  await openGame(again);
  await play(again);
  await expect(again.locator('.finder')).toBeHidden();
  await expect(again.locator('.found-banner')).toHaveCount(0);
});
