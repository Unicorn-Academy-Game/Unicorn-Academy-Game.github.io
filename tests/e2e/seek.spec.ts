import { expect, type Page, test } from '@playwright/test';
import { PAGES, type WordId } from '../../src/content/lexicon';
import type { MapId } from '../../src/shared/ids';
import {
  bookWord,
  freeze,
  hush,
  keepWord,
  learningOn,
  mapId,
  openBook,
  openGame,
  play,
  SCRATCH,
  seeking,
  settled,
  shot,
  spellBook,
  step,
  typeWord,
  untilArrived,
} from './helpers';

/** The bubble that goes with her to a word, and the small button that stops the search. */
const bubble = (page: Page) => page.locator('[data-content-id="learning.seek.go"]');
const stop = (page: Page) => page.locator('[data-content-id="learning.seek.stop"]');

/**
 * The game begun with learning on, in the forest or where a test says. The creatures are sent away
 * unless a test is about them.
 */
async function startedIn(
  page: Page,
  at?: { mapId: MapId; spawnId: string },
  { creatures = false }: { creatures?: boolean } = {},
): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  if (at) await page.evaluate((to) => window.__ua!.controller.travel(to), at);
  if (!creatures) await hush(page);
  await learningOn(page);
}

/**
 * Opens the book at the page of a word the player has not found, and taps the shape that waits for
 * it.
 */
async function askToBeShown(page: Page, word: WordId): Promise<void> {
  await openBook(page);
  const where = PAGES.find((p) => (p.words as readonly string[]).includes(word))!;
  await spellBook(page).locator(`.book-tab[data-page="${where.id}"]`).click();
  await settled(page);
  await bookWord(page, word).locator('[data-content-id="learning.book.find"]').click();
  await expect(spellBook(page)).toHaveCount(0);
}

/**
 * Runs the herd on until it is in another place, which is where a way out takes it, and waits for
 * that place to be there.
 */
async function untilIn(page: Page, to: string, seconds = 60): Promise<void> {
  for (let waited = 0; waited < seconds && (await mapId(page)) !== to; waited++) {
    if ((await page.evaluate(() => window.__ua!.controller.phase)) !== 'playing') break;
    await step(page, 1);
  }
  await untilArrived(page, to);
}

/** Whether a bubble is wholly on the screen, and clear of the top strip where the buttons are. */
async function onScreen(page: Page, what: ReturnType<typeof bubble>): Promise<boolean> {
  const box = (await what.boundingBox())!;
  const size = page.viewportSize()!;
  return box.x >= 0 && box.y >= 64 && box.x + box.width <= size.width && box.y + box.height <= size.height;
}

/**
 * The bubbles for ways out that touch the bubble for the word, by what they say. One that is fading
 * away is not counted.
 */
const sittingOnIt = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const mine = document.querySelector('.guide .seek')!.getBoundingClientRect();
    const touches = (r: DOMRect) =>
      r.left < mine.right && r.right > mine.left && r.top < mine.bottom && r.bottom > mine.top;
    return [...document.querySelectorAll('.guide .exit:not([data-leaving="true"])')]
      .filter((e) => touches(e.getBoundingClientRect()))
      .map((e) => e.getAttribute('aria-label') ?? '');
  });

test.describe('being shown where a word is', () => {
  test.setTimeout(240_000);

  test('a word the player has not found is a button in the book, and tapping it closes the book and sets the bubble over what gives it', async ({
    page,
  }) => {
    await startedIn(page, { mapId: 'treasure-house', spawnId: 'from-garden' });
    expect(await seeking(page)).toBeNull();
    await expect(bubble(page)).toHaveCount(0);

    await openBook(page);
    const where = PAGES.find((p) => (p.words as readonly string[]).includes('ruby'))!;
    await spellBook(page).locator(`.book-tab[data-page="${where.id}"]`).click();
    await settled(page);
    const find = bookWord(page, 'ruby').getByRole('button', {
      name: 'A word with 4 letters, waiting to be found. Show me where',
    });
    await expect(find).toBeVisible();
    expect((await find.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await shot(page, `${SCRATCH}/seek-book.png`);
    await find.click();

    await expect(spellBook(page)).toHaveCount(0);
    expect(await seeking(page)).toBe('ruby');
    await expect(bubble(page)).toBeVisible();
    await expect(bubble(page)).toHaveAccessibleName('Show me the way to the word with 4 letters');
    expect(await onScreen(page, bubble(page))).toBe(true);
    await expect(stop(page)).toBeVisible();
    await step(page, 1);
    await shot(page, `${SCRATCH}/seek-bubble-here.png`);
  });

  test('the first thing she comes to asks for that word, and the search is over when it is spelled', async ({
    page,
  }) => {
    await startedIn(page, { mapId: 'treasure-house', spawnId: 'from-garden' });
    await askToBeShown(page, 'ruby');
    await step(page, 8);
    await expect(page.getByRole('dialog', { name: 'Spell ruby' })).toBeVisible();
    await typeWord(page, 'ruby');
    await keepWord(page);
    expect(await page.evaluate(() => window.__ua!.learner.get().words.ruby?.spell?.done)).toBe(1);
    expect(await seeking(page)).toBeNull();
    await expect(bubble(page)).toHaveCount(0);
  });

  test('from another place the bubble is at the edge, pointing the way, and each tap on it is a step along the road', async ({
    page,
  }) => {
    await startedIn(page);
    expect(await mapId(page)).toBe('forest');
    // Gold is only in the treasure house. A gem grows in the crystal cave too, which is nearer, so
    // a gem would not take this road.
    await askToBeShown(page, 'gold');
    await expect(bubble(page)).toBeVisible();
    await step(page, 1);
    await shot(page, `${SCRATCH}/seek-forest.png`);

    // The forest has a gate to the palace garden, which has the gate to the treasure house.
    await bubble(page).click();
    await untilIn(page, 'palace-garden');
    expect(await seeking(page)).toBe('gold');
    await expect(bubble(page)).toBeVisible();
    expect(await onScreen(page, bubble(page))).toBe(true);
    await step(page, 1);
    await shot(page, `${SCRATCH}/seek-garden.png`);

    await bubble(page).click();
    await untilIn(page, 'treasure-house');
    expect(await seeking(page)).toBe('gold');
    await expect(bubble(page)).toBeVisible();
    await step(page, 1);
    await shot(page, `${SCRATCH}/seek-treasure.png`);

    await bubble(page).click();
    await step(page, 8);
    await expect(page.getByRole('dialog', { name: 'Spell gold' })).toBeVisible();
    await typeWord(page, 'gold');
    await keepWord(page);
    expect(await seeking(page)).toBeNull();
  });

  test('a gem grows in the crystal cave, one gate from the forest, so the first step for a gem is the cave', async ({
    page,
  }) => {
    await startedIn(page);
    expect(await mapId(page)).toBe('forest');
    await askToBeShown(page, 'ruby');
    await expect(bubble(page)).toBeVisible();
    await bubble(page).click();
    await untilIn(page, 'crystal-cave');
    // The way north goes through Leaf's clearing, and meeting her asks for her name on a card,
    // which hides the bubbles until it is put away.
    const card = page.getByRole('dialog', { name: /^Spell / });
    if ((await card.count()) > 0) await card.getByRole('button', { name: 'Close' }).click();
    expect(await seeking(page)).toBe('ruby');
    await expect(bubble(page)).toBeVisible();
    expect(await onScreen(page, bubble(page))).toBe(true);
    await step(page, 1);
    await shot(page, `${SCRATCH}/seek-cave.png`);
  });

  test('its bubble is never covered by, or covers, the bubble of a way out', async ({ page }) => {
    await startedIn(page);
    for (const word of ['storm', 'ruby', 'leaf'] as const) {
      await askToBeShown(page, word);
      await expect(bubble(page)).toBeVisible();
      // Asking sets her off along the road, so a long step would bring her to Leaf, whose card
      // hides the bubbles. The layout needs only a moment.
      await step(page, 0.3);
      expect(await sittingOnIt(page), word).toEqual([]);
      await stop(page).click();
    }
  });

  test('the small button stops the search, and the way out keeps its own bubble again', async ({ page }) => {
    await startedIn(page);
    await askToBeShown(page, 'ruby');
    await expect(bubble(page)).toBeVisible();
    await stop(page).click();
    expect(await seeking(page)).toBeNull();
    await expect(bubble(page)).toHaveCount(0);
  });

  test('a word that is a creature is asked for the moment the creature is touched, wherever it is', async ({
    page,
  }) => {
    await startedIn(page, undefined, { creatures: true });
    await askToBeShown(page, 'frog');
    await expect(page.getByRole('dialog', { name: 'Spell frog' })).toBeVisible({ timeout: 20_000 });
    await typeWord(page, 'frog');
    await keepWord(page);
    expect(await seeking(page)).toBeNull();
  });
});
