import { expect, type Page, test } from '@playwright/test';
import { PAGES, type PageId, WORD_IDS } from '../../src/content/lexicon';
import {
  bookChip,
  bookWord,
  freeze,
  hush,
  keepWord,
  learningOn,
  openBook,
  openGame,
  play,
  SCRATCH,
  seedBook,
  seeking,
  settled,
  shot,
  spellBook,
  spellCard,
  spotOn,
  standBelow,
  step,
  tapWorld,
  typeWord,
  worldRuns,
} from './helpers';

const WORDS_IN_THE_BOOK = WORD_IDS.length;

const pageOf = (id: PageId): (typeof PAGES)[number] => PAGES.find((p) => p.id === id)!;
const TITLES = PAGES.map((p) => p.title);

/** How far a swipe goes along the page, in pixels. The book turns for 56 and more. */
const SWIPE = 60;

/**
 * A book with something on most pages, at every level, and a word that is ready again. Bunny is the
 * newest.
 */
const SOME = {
  ruby: { level: 2 },
  apple: { level: 5, best: 5 },
  carrot: { level: 4, best: 4 },
  gold: { level: 1 },
  frog: { level: 5, best: 5 },
  bird: { level: 3, best: 3, due: -1000 },
  bunny: { level: 1 },
} as const;

async function playing(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  // The title fades out after the tap, and a look at the page before it has gone is a look at the
  // title.
  await page.locator('.title').waitFor({ state: 'hidden' });
  await freeze(page);
  await hush(page);
}

/** How many words the corner button says are in the book. */
const chipCount = (page: Page): Promise<string> => bookChip(page).locator('.bookchip-count').innerText();

test.describe('the button in the corner', () => {
  test("is there whether learning is on or off, and says how many words are in the player's book", async ({ page }) => {
    await playing(page);
    await expect(bookChip(page), 'with learning off').toBeVisible();
    await expect(bookChip(page)).toHaveAccessibleName(`Open my Spell Book. 0 of ${WORDS_IN_THE_BOOK} words.`);
    await learningOn(page);
    await expect(bookChip(page)).toBeVisible();
    expect(await chipCount(page)).toBe('0');

    await seedBook(page, { frog: {}, bird: {} });
    await expect(bookChip(page)).toHaveAccessibleName(`Open my Spell Book. 2 of ${WORDS_IN_THE_BOOK} words.`);
    expect(await chipCount(page)).toBe('2');

    await page.evaluate(() =>
      window.__ua!.settings.update({ learning: { ...window.__ua!.settings.get().learning, on: false } }),
    );
    await expect(bookChip(page), 'turned off again').toBeVisible();
    expect(await chipCount(page)).toBe('2');
  });

  test("opens the player's book with learning off, and a word in it only nods", async ({ page }) => {
    await playing(page);
    await seedBook(page, { frog: {}, bird: {} });
    await openBook(page);
    await expect(spellBook(page)).toBeVisible();
    await expect(bookWord(page, 'frog')).toHaveAttribute('data-found', 'true');
    await bookWord(page, 'frog').getByRole('button').click();
    await expect(spellCard(page), 'no card comes while learning is off').toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(spellBook(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
  });

  test('sits under the unicorn counter and does not cover the way out', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    const chip = (await bookChip(page).boundingBox())!;
    const finder = (await page.locator('.finder').boundingBox())!;
    expect(chip.y).toBeGreaterThanOrEqual(finder.y + finder.height - 1);
    expect(chip.x).toBeGreaterThanOrEqual(0);
    expect(chip.height).toBeGreaterThanOrEqual(44);
    await shot(page, `${SCRATCH}/book-chip.png`);
  });
});

test.describe('a word that has been spelled', () => {
  test.setTimeout(240_000);

  test('flies to the button, and the count goes up when it lands and not before', async ({ page }) => {
    await playing(page);
    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
    await hush(page);
    await learningOn(page);
    await standBelow(page, 'palace-garden/orchard-1', 40);
    await tapWorld(page, await spotOn(page, 'palace-garden/orchard-1'));
    await expect(page.getByRole('dialog', { name: 'Spell apple' })).toBeVisible();
    await typeWord(page, 'apple');
    await expect(page.locator('.spell[data-done="true"]')).toBeVisible();
    // Count the pictures that fly from now on, and look at what the book and the button say. The
    // word is in the player's book already, and the button has not said so.
    const before = await page.evaluate(() => {
      const seen = { flew: 0 };
      (window as unknown as { __flight: typeof seen }).__flight = seen;
      new MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes)
            if (n instanceof HTMLElement && n.classList.contains('book-flyer')) seen.flew += 1;
      }).observe(document.getElementById('ui')!, { childList: true });
      return {
        done: window.__ua!.learner.get().words.apple?.spell?.done,
        count: document.querySelector('.bookchip-count')!.textContent,
      };
    });
    expect(before).toEqual({ done: 1, count: '0' });
    await keepWord(page);
    // A picture that flies needs the screen to draw frames, and a busy machine draws few: one took
    // 21 seconds to land, and a page stood still for 29 (measured in traces at a load average of
    // 130 to 270). It lands when it lands.
    await expect.poll(() => chipCount(page), { timeout: 120_000 }).toBe('1');
    expect(await page.evaluate(() => (window as unknown as { __flight: { flew: number } }).__flight.flew)).toBe(1);
    await expect(page.locator('.book-flyer')).toHaveCount(0);
    await expect(bookChip(page)).toHaveAccessibleName(`Open my Spell Book. 1 of ${WORDS_IN_THE_BOOK} words.`);
    await shot(page, `${SCRATCH}/book-chip-one.png`);
  });

  test('is counted at once, with nothing flying, when the parent asked for fewer effects', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await page.evaluate(() => window.__ua!.lessons.practice('frog'));
    await expect(spellCard(page)).toBeVisible();
    await typeWord(page, 'frog');
    await keepWord(page);
    expect(await chipCount(page)).toBe('1');
    await expect(page.locator('.book-flyer')).toHaveCount(0);
  });

  test('goes on by itself when the player does not tap, and the picture still goes to the button', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    // For her the wait is a few seconds. Here it is short, so the test is not waiting for as long.
    await page.evaluate(() => {
      window.__ua!.lessons.autoContinueMs = 1200;
    });
    expect(await page.evaluate(() => window.__ua!.lessons.practice('frog'))).toBe(true);
    await expect(spellCard(page)).toBeVisible();
    await typeWord(page, 'frog');
    // Nobody taps. The card goes, the world runs again, and the count goes up when the picture has
    // flown.
    await expect(page.locator('.spell')).toHaveCount(0, { timeout: 60_000 });
    expect(await worldRuns(page)).toBe(true);
    await expect.poll(() => chipCount(page), { timeout: 120_000 }).toBe('1');
    await expect(page.locator('.book-flyer')).toHaveCount(0);
  });
});

test.describe('the book', () => {
  test.setTimeout(240_000);

  test("opens on the page of the player's newest word, with words in colour and the rest as shapes, and the world rests under it", async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    expect(await worldRuns(page)).toBe(true);
    await openBook(page);

    const sheet = spellBook(page);
    await expect(sheet.getByRole('heading', { name: 'My Spell Book' })).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'The Meadow' })).toBeVisible();
    expect(await worldRuns(page)).toBe(false);
    await expect(sheet.getByRole('tab', { selected: true })).toHaveAccessibleName(
      new RegExp(`^The Meadow\\. 3 of ${pageOf('meadow').words.length} found`),
    );

    // Frog is in colour with all five stars. Snail is a shape with a place for each of its five
    // letters, and its name is not on the page.
    await expect(bookWord(page, 'frog')).toHaveAttribute('data-found', 'true');
    await expect(bookWord(page, 'frog')).toHaveAttribute('data-stars', '5');
    await expect(bookWord(page, 'frog').getByRole('button')).toHaveAccessibleName('frog. 5 of 5 stars. Spell it again');
    await expect(bookWord(page, 'bird')).toHaveAttribute('data-due', 'true');
    await expect(bookWord(page, 'bunny')).toHaveAttribute('data-due', 'false');
    await expect(bookWord(page, 'snail')).toHaveAttribute('data-found', 'false');
    await expect(bookWord(page, 'snail').locator('.book-dot')).toHaveCount(5);
    await expect(
      bookWord(page, 'snail').getByRole('button', {
        name: 'A word with 5 letters, waiting to be found. Show me where',
      }),
    ).toBeVisible();
    await expect(bookWord(page, 'snail')).not.toContainText('snail');
    // Bunny is the player's newest word, so it wears the sparkle, and no other card does.
    await expect(bookWord(page, 'bunny').locator('.book-new')).toBeVisible();
    await expect(bookWord(page, 'bunny').getByRole('button')).toHaveAccessibleName(
      'bunny. 5 of 5 stars. The newest word. Spell it again',
    );
    await expect(sheet.locator('.book-new:visible')).toHaveCount(1);
    await shot(page, `${SCRATCH}/book-meadow.png`);
  });

  test('shows how much the player has at the top and on every tab', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    await openBook(page);
    await expect(spellBook(page).locator('.book-totals')).toHaveAccessibleName(
      `7 of ${WORDS_IN_THE_BOOK} words, 35 stars`,
    );
    await expect(spellBook(page).getByRole('tab', { name: /^The Orchard/ })).toHaveAccessibleName(
      `The Orchard. 2 of ${pageOf('orchard').words.length} found`,
    );
    await expect(spellBook(page).getByRole('tab', { name: /^Gold and Money/ })).toHaveAccessibleName(
      `Gold and Money. 1 of ${pageOf('gold').words.length} found`,
    );
    await expect(spellBook(page).getByRole('tab', { name: /^Unicorn Friends/ })).toHaveAccessibleName(
      `Unicorn Friends. 0 of ${pageOf('friends').words.length} found`,
    );
  });

  test('turns by its tabs, by the arrow keys, and by a swipe along the page', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    await openBook(page);
    const sheet = spellBook(page);
    const title = sheet.locator('.book-page-title');

    await sheet.getByRole('tab', { name: /^The Orchard/ }).click();
    await expect(title).toHaveText('The Orchard');
    await expect(sheet.getByRole('tab', { name: /^The Orchard/ })).toHaveAttribute('aria-selected', 'true');
    await expect(bookWord(page, 'apple')).toHaveAttribute('data-stars', '5');
    await expect(bookWord(page, 'carrot')).toHaveAttribute('data-stars', '5');
    await shot(page, `${SCRATCH}/book-orchard.png`);

    await page.keyboard.press('ArrowRight');
    await expect(title).toHaveText(TITLES[4]!);
    await shot(page, `${SCRATCH}/book-keys.png`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(title).toHaveText(TITLES[2]!);
    await page.keyboard.press('End');
    await expect(title).toHaveText(TITLES.at(-1)!);
    await page.keyboard.press('ArrowRight');
    await expect(title).toHaveText('The Meadow');
    await page.keyboard.press('ArrowLeft');
    await expect(title).toHaveText(TITLES.at(-1)!);
    await page.keyboard.press('Home');
    await expect(title).toHaveText('The Meadow');
    // Focus follows the page, so the next arrow is from where she is.
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-page'))).toBe('meadow');

    const grid = (await sheet.locator('.book-page').boundingBox())!;
    const y = grid.y + grid.height / 2;
    await page.mouse.move(grid.x + grid.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(grid.x + grid.width * 0.3, y + 6, { steps: 6 });
    await page.mouse.up();
    await expect(title).toHaveText(TITLES[1]!);
    await page.mouse.move(grid.x + grid.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(grid.x + grid.width * 0.7, y - 4, { steps: 6 });
    await page.mouse.up();
    await expect(title).toHaveText('The Meadow');

    // A little slide, or a swipe that is more up than along, turns nothing. They start on the
    // heading, because a card takes a touch for itself, and a card that is not found yet sends her
    // to look for the word.
    const heading = (await sheet.locator('.book-page-head').boundingBox())!;
    const hy = heading.y + heading.height / 2;
    await page.mouse.move(grid.x + grid.width * 0.5, hy);
    await page.mouse.down();
    await page.mouse.move(grid.x + grid.width * 0.5 + 20, hy);
    await page.mouse.up();
    await page.mouse.move(grid.x + grid.width * 0.5, hy);
    await page.mouse.down();
    await page.mouse.move(grid.x + grid.width * 0.5 - 80, hy + 120, { steps: 5 });
    await page.mouse.up();
    await expect(title).toHaveText('The Meadow');
  });

  test('is not tapped by a swipe that starts and ends on one card', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    await openBook(page);
    const sheet = spellBook(page);
    const title = sheet.locator('.book-page-title');
    await sheet.getByRole('tab', { name: /^Unicorn Friends/ }).click();
    await expect(title).toHaveText('Unicorn Friends');

    // A mouse that is let go on the card it went down on clicks it, however far it has slid, and a
    // card is wider than a swipe is long.
    const card = (await sheet.locator('.book-word[data-found="false"] .book-card').first().boundingBox())!;
    expect(card.width, 'a card has to be wider than a swipe for the swipe to stay on it').toBeGreaterThan(SWIPE + 8);
    const y = card.y + card.height / 2;
    await page.mouse.move(card.x + 4, y);
    await page.mouse.down();
    await page.mouse.move(card.x + 4 + SWIPE, y, { steps: 6 });
    await page.mouse.up();

    await expect(title).not.toHaveText('Unicorn Friends');
    await expect(sheet).toBeVisible();
    expect(await seeking(page)).toBeNull();
  });

  test('keeps Tab inside it, and leaves Wildstar where she was', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    const before = await page.evaluate(() => ({ ...window.__ua!.controller.world.unicorns.wildstar!.pos }));
    await openBook(page);
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('.book-sheet') !== null), `Tab ${i}`).toBe(true);
    }
    for (const key of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown']) await page.keyboard.press(key);
    // A tap on the book that is on nothing in particular does not send her anywhere either.
    const head = (await spellBook(page).locator('.book-head').boundingBox())!;
    await page.mouse.click(head.x + head.width / 2, head.y + head.height / 2);
    await page.keyboard.press('Escape');
    await expect(spellBook(page)).toHaveCount(0);
    await step(page, 2);
    expect(await page.evaluate(() => ({ ...window.__ua!.controller.world.unicorns.wildstar!.pos }))).toEqual(before);
    expect(await page.evaluate(() => window.__ua!.controller.world.leader.phase)).toBe('idle');
  });

  test('closes with the cross, with Escape, and with a tap on the dark around it, and the world wakes each time', async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);

    await openBook(page);
    await spellBook(page).getByRole('button', { name: 'Close the Spell Book' }).click();
    await expect(spellBook(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);

    await openBook(page);
    await page.keyboard.press('Escape');
    await expect(spellBook(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);

    await openBook(page);
    await page.mouse.click(4, 200);
    await expect(spellBook(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);

    // A tap on the book itself does not close it.
    await openBook(page);
    const head = (await spellBook(page).locator('.book-title').boundingBox())!;
    await page.mouse.click(head.x + 4, head.y + head.height / 2);
    await expect(spellBook(page)).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('gives focus back to the button that opened it', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    await bookChip(page).focus();
    await page.keyboard.press('Enter');
    await expect(spellBook(page)).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.classList.contains('book-sheet'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(spellBook(page)).toHaveCount(0);
    await expect(bookChip(page)).toBeFocused();
  });

  test('stays when a parent turns learning off, so the player can still look at their words, and what is in it is kept', async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    await openBook(page);
    await page.evaluate(() =>
      window.__ua!.settings.update({ learning: { ...window.__ua!.settings.get().learning, on: false } }),
    );
    await expect(spellBook(page)).toBeVisible();
    await expect(bookChip(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(spellBook(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
    expect(await chipCount(page)).toBe('7');
    await learningOn(page);
    expect(await chipCount(page)).toBe('7');
  });

  test('is not opened by the button while a card is up', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await page.evaluate(() => window.__ua!.lessons.practice('frog'));
    await expect(spellCard(page)).toBeVisible();
    await page.evaluate(() => (window.__ua!.bookChip.node as HTMLButtonElement).click());
    await expect(spellBook(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(spellCard(page)).toHaveCount(0);
  });
});

test.describe('a word picked from the book', () => {
  test.setTimeout(240_000);

  test('goes up over the book, and the book is still there under it when it is done', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    await openBook(page);
    await bookWord(page, 'bird').getByRole('button').click();
    await expect(page.getByRole('dialog', { name: 'Spell the word for this picture' })).toBeVisible();
    await expect(spellBook(page)).toBeVisible();
    expect(await worldRuns(page)).toBe(false);
    await page.waitForTimeout(500);
    await shot(page, `${SCRATCH}/book-card-over.png`);

    // Tab stays on the card and does not go through to the book under it.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('.spell-card') !== null), `Tab ${i}`).toBe(true);
    }
    // Escape closes the card and leaves the book, and the word is as it was.
    await page.keyboard.press('Escape');
    await expect(spellCard(page)).toHaveCount(0);
    await expect(spellBook(page)).toBeVisible();
    expect(await worldRuns(page)).toBe(false);
    await expect(bookWord(page, 'bird')).toHaveAttribute('data-stars', '5');
  });

  test('keeps all its stars when it is spelled again after its time, and the picture lands', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    await openBook(page);
    await expect(bookWord(page, 'bird')).toHaveAttribute('data-stars', '5');
    await bookWord(page, 'bird').getByRole('button').click();
    await expect(spellCard(page)).toBeVisible();
    await typeWord(page, 'bird');
    // The card goes on by itself after a few seconds, so nothing slow is done between its saying so
    // and the word being kept.
    await page.evaluate(() => {
      const seen = { landing: false, flew: 0 };
      (window as unknown as { __cell: typeof seen }).__cell = seen;
      const watch = (): void => {
        if (document.querySelector('.book-word[data-landing="true"]')) seen.landing = true;
      };
      new MutationObserver(watch).observe(document.getElementById('ui')!, {
        attributes: true,
        subtree: true,
        childList: true,
      });
    });
    await keepWord(page);
    await expect(bookWord(page, 'bird')).toHaveAttribute('data-stars', '5');
    await expect(page.locator('.book-flyer')).toHaveCount(0);
    await expect(bookWord(page, 'bird')).not.toHaveAttribute('data-landing', 'true');
    expect(await page.evaluate(() => (window as unknown as { __cell: { landing: boolean } }).__cell.landing)).toBe(
      true,
    );
    // It is not due again, its card no longer glows, and the book is where the player left it, with
    // the world at rest.
    await expect(bookWord(page, 'bird')).toHaveAttribute('data-due', 'false');
    await expect(spellBook(page)).toBeVisible();
    expect(await worldRuns(page)).toBe(false);
    await expect(spellBook(page).locator('.book-totals')).toHaveAccessibleName(
      `7 of ${WORDS_IN_THE_BOOK} words, 35 stars`,
    );
    await shot(page, `${SCRATCH}/book-respelled.png`);

    // Closing the book wakes the world, and the button says the same number it did.
    await page.keyboard.press('Escape');
    expect(await worldRuns(page)).toBe(true);
    expect(await chipCount(page)).toBe('7');
  });

  test('does not count again a word the player already had, and the button does not change', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    await page.evaluate(() => window.__ua!.lessons.practice('frog'));
    await typeWord(page, 'frog');
    await keepWord(page);
    await page.waitForTimeout(900);
    expect(await chipCount(page)).toBe('7');
    expect(await page.evaluate(() => window.__ua!.learner.get().words.frog?.spell?.done)).toBe(2);
  });
});

test.describe('a word found while the book is open', () => {
  test('appears where its shape was, and the page and the top say so', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, { frog: {} });
    await openBook(page);
    await expect(bookWord(page, 'bird')).toHaveAttribute('data-found', 'false');
    await expect(bookWord(page, 'frog').locator('.book-new')).toBeVisible();
    await seedBook(page, { frog: {}, bird: {} });
    await expect(bookWord(page, 'bird')).toHaveAttribute('data-found', 'true');
    // The sparkle goes to the word the player has just found.
    await expect(bookWord(page, 'bird').locator('.book-new')).toBeVisible();
    await expect(bookWord(page, 'frog').locator('.book-new')).toBeHidden();
    await expect(bookWord(page, 'bird').getByRole('button')).toBeVisible();
    await expect(spellBook(page).locator('.book-totals')).toHaveAccessibleName(
      `2 of ${WORDS_IN_THE_BOOK} words, 10 stars`,
    );
    await expect(spellBook(page).locator('.book-page-progress')).toHaveText(`2 of ${pageOf('meadow').words.length}`);
  });

  test('is cleared when a parent starts a new book, and the page is all shapes again', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, SOME);
    await openBook(page);
    await page.evaluate(() => window.__ua!.learner.set({ schemaVersion: 1, words: {} }));
    await expect(bookWord(page, 'frog')).toHaveAttribute('data-found', 'false');
    await expect(spellBook(page).locator('.book-totals')).toHaveAccessibleName(
      `0 of ${WORDS_IN_THE_BOOK} words, 0 stars`,
    );
  });
});

/**
 * Every word the player can find, found, and spelled well: a page full of the longest names there
 * are.
 */
const EVERY_WORD = Object.fromEntries(WORD_IDS.map((word) => [word, { level: 5, best: 5 }]));

/**
 * The screens the game is played on, from the smallest phone held sideways to a desktop. The room a
 * page gets is worked out from these.
 */
const SCREENS = [
  { name: 'phone-small', width: 568, height: 320 },
  { name: 'phone', width: 915, height: 412 },
  { name: 'phone-tall', width: 390, height: 844 },
  { name: 'phone-narrow', width: 360, height: 640 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1280, height: 720 },
] as const;

/**
 * Everything wrong with how the page that is open sits on the screen, as sentences. A book that is
 * right says nothing: the sheet is on the screen, nothing scrolls, every card is whole inside the
 * page and clear of the others, a card the player can tap is big enough to tap, and every name is
 * whole.
 */
const wrongWithThePage = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const wrong: string[] = [];
    const rect = (el: Element): DOMRect => el.getBoundingClientRect();
    const inside = (a: DOMRect, b: DOMRect, slack: number): boolean =>
      a.left >= b.left - slack && a.right <= b.right + slack && a.top >= b.top - slack && a.bottom <= b.bottom + slack;

    const sheet = rect(document.querySelector('.book-sheet')!);
    if (!inside(sheet, new DOMRect(0, 0, innerWidth, innerHeight), 0.5))
      wrong.push(
        `the sheet is off the screen: ${Math.round(sheet.left)},${Math.round(sheet.top)} to ${Math.round(sheet.right)},${Math.round(sheet.bottom)} on ${innerWidth}x${innerHeight}`,
      );
    for (const part of ['.book-head', '.book-tabs', '.book-page'])
      if (!inside(rect(document.querySelector(part)!), sheet, 1)) wrong.push(`${part} is outside the sheet`);
    const row = rect(document.querySelector('.book-tabs')!);
    const tabs = [...document.querySelectorAll<HTMLElement>('.book-tab')].map((tab, i) => ({
      i,
      box: rect(tab),
      emblem: rect(tab.querySelector('.book-emblem')!),
      dots: rect(tab.querySelector('.book-pips')!),
    }));
    for (const { i, box, emblem, dots } of tabs) {
      if (!inside(box, row, 1)) wrong.push(`tab ${i} is outside the row of tabs`);
      if (!inside(emblem, box, 1)) wrong.push(`tab ${i}: its picture is outside the tab`);
      if (!inside(dots, box, 1)) wrong.push(`tab ${i}: its dots are outside the tab`);
      if (Math.abs(emblem.width - emblem.height) > 1) wrong.push(`tab ${i}: its picture is not square`);
      if (box.width < 40 || box.height < 40)
        wrong.push(`tab ${i} is ${Math.round(box.width)}x${Math.round(box.height)}, too small to tap`);
    }
    for (const a of tabs) {
      for (const b of tabs.slice(a.i + 1)) {
        const across = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
        const down = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
        if (across > 1 && down > 1) wrong.push(`tabs ${a.i} and ${b.i} are on top of each other`);
      }
    }
    const title = document.querySelector('.book-title') as HTMLElement;
    if (title.scrollWidth > title.clientWidth + 1 || !inside(rect(title), sheet, 1))
      wrong.push('the name of the book is cut short');
    const totals = rect(document.querySelector('.book-totals')!);
    if (!inside(totals, sheet, 1)) wrong.push('what she has is outside the sheet');

    const grid = document.querySelector('.book-grid') as HTMLElement;
    const room = rect(grid);
    if (grid.scrollHeight > grid.clientHeight + 1)
      wrong.push(`the page scrolls: ${grid.scrollHeight} of ${grid.clientHeight}`);
    const places = [...grid.querySelectorAll<HTMLElement>('.book-word')];
    const cards = places.map((place) => ({
      word: place.dataset.word!,
      card: rect(place.querySelector('.book-card')!),
      place,
    }));
    for (const { word, card, place } of cards) {
      if (!inside(card, room, 1)) wrong.push(`${word}: its card is not whole inside the page`);
      if (card.width < 44 || card.height < 44)
        wrong.push(`${word}: its card is ${Math.round(card.width)}x${Math.round(card.height)}, too small to tap`);
      const frame = rect(place.querySelector('.book-frame')!);
      if (Math.abs(frame.width - frame.height) > 1) wrong.push(`${word}: its picture is not square`);
      if (!inside(frame, card, 1)) wrong.push(`${word}: its picture is outside its card`);
      const name = place.querySelector<HTMLElement>('.book-name');
      if (name && (name.scrollWidth > name.clientWidth + 1 || !inside(rect(name), card, 1)))
        wrong.push(`${word}: its name is cut short or outside its card`);
      const stars = place.querySelector('.book-stars');
      if (stars && !inside(rect(stars), card, 1)) wrong.push(`${word}: its stars are outside its card`);
      const dots = place.querySelector('.book-dots');
      if (dots && !inside(rect(dots), card, 1)) wrong.push(`${word}: its places for letters are outside its card`);
    }
    for (const [i, a] of cards.entries()) {
      for (const b of cards.slice(i + 1)) {
        const across = Math.min(a.card.right, b.card.right) - Math.max(a.card.left, b.card.left);
        const down = Math.min(a.card.bottom, b.card.bottom) - Math.max(a.card.top, b.card.top);
        if (across > 1 && down > 1) wrong.push(`${a.word} and ${b.word} are on top of each other`);
      }
    }
    const widths = new Set(cards.map((c) => Math.round(c.card.width)));
    if (widths.size > 1) wrong.push(`the cards are not the same width: ${[...widths].join(', ')}`);
    return wrong;
  });

test.describe('how the book looks', () => {
  test.setTimeout(300_000);

  for (const screen of SCREENS) {
    test(`on a ${screen.name} screen, every page holds all its words, whole, with room to tap each`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await playing(page);
      await learningOn(page);
      await seedBook(page, EVERY_WORD);
      await openBook(page);
      const sheet = spellBook(page);
      for (const [i, tab] of (await sheet.getByRole('tab').all()).entries()) {
        await tab.click();
        await settled(page);
        expect(await wrongWithThePage(page), `${screen.name}, page ${i}, every word found`).toEqual([]);
        await shot(page, `${SCRATCH}/book-${screen.name}-full-${i}.png`);
      }
    });
  }

  for (const screen of [SCREENS[0], SCREENS[1], SCREENS[2]]) {
    test(`on a ${screen.name} screen, a page with some words found and some waiting is as whole`, async ({ page }) => {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await playing(page);
      await learningOn(page);
      await seedBook(page, SOME);
      await openBook(page);
      const sheet = spellBook(page);
      for (const [i, tab] of (await sheet.getByRole('tab').all()).entries()) {
        await tab.click();
        await settled(page);
        expect(await wrongWithThePage(page), `${screen.name}, page ${i}, some words found`).toEqual([]);
        await shot(page, `${SCRATCH}/book-${screen.name}-some-${i}.png`);
      }
    });
  }

  test('lays a page out again when the phone is turned', async ({ page }) => {
    await page.setViewportSize({ width: 915, height: 412 });
    await playing(page);
    await learningOn(page);
    await seedBook(page, EVERY_WORD);
    await openBook(page);
    await spellBook(page)
      .getByRole('tab', { name: /^The Orchard/ })
      .click();
    await settled(page);
    expect(await wrongWithThePage(page), 'sideways').toEqual([]);
    const rows = (): Promise<number> =>
      page.evaluate(
        () =>
          new Set([...document.querySelectorAll('.book-word')].map((li) => Math.round(li.getBoundingClientRect().top)))
            .size,
      );
    expect(await rows()).toBe(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => rows()).toBeGreaterThan(1);
    await settled(page);
    expect(await wrongWithThePage(page), 'upright').toEqual([]);

    await page.setViewportSize({ width: 915, height: 412 });
    await expect.poll(() => rows()).toBe(1);
    await settled(page);
    expect(await wrongWithThePage(page), 'sideways again').toEqual([]);
  });
});
