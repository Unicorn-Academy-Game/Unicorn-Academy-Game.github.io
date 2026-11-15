import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { PAGES, WORD_IDS } from '../../src/content/lexicon';
import { STARS_PER_WORD } from '../../src/learning';
import {
  BOOT_MS,
  bookChip,
  bookWord,
  closeParent,
  freeze,
  GEAR,
  goTo,
  hush,
  learningOn,
  openBook,
  openGame,
  openParent,
  play,
  SCRATCH,
  seedBook,
  shot,
  spellBook,
  spellCard,
  type Visit,
  watchConsole,
} from './helpers';

const DAY = 86_400_000;
const MINUTE = 60_000;

const WORDS = WORD_IDS.length;

/** Words at every level: one ready again, and a few that took more wrong keys. */
const SOME = {
  bird: { level: 3, best: 3, due: -1_000, done: 3, slips: 7 },
  frog: { level: 5, best: 5, due: 14 * DAY },
  bunny: { level: 1, best: 1, due: 10 * MINUTE, done: 2, slips: 3 },
  snail: { level: 0, best: 0, due: 0, done: 1 },
  ladybug: { level: 2, best: 2, due: 60 * MINUTE, done: 4, slips: 1 },
  apple: { level: 4, best: 4, due: DAY },
  unicorn: { level: 1, best: 1, due: 10 * MINUTE, done: 2, slips: 5 },
} as const;

/** The rest of the Meadow, each spelled once. */
const MEADOW = PAGES[0]!;
const REST = MEADOW.words.filter((word) => !(word in SOME));

/** Those words and the Meadow finished. A word the player has found has all its stars. */
const BOOK = { ...SOME, ...Object.fromEntries(REST.map((word) => [word, { level: 1, best: 1 }])) } as typeof SOME;
const FOUND = Object.keys(BOOK).length;
const STARS = FOUND * STARS_PER_WORD;

/** What a file holds for one word: a level, and the best level it has reached. */
const bookWord1 = (level = 1) => ({
  level,
  best: level,
  streak: 0,
  struggles: 0,
  due: Date.now() + DAY,
  done: 1,
  clean: 1,
  slips: 0,
  first: Date.now() - 1000,
  last: Date.now() - 1000,
});

async function playing(page: Page, visit: Visit = 'kept'): Promise<void> {
  await openGame(page, visit);
  await play(page);
  await page.locator('.title').waitFor({ state: 'hidden' });
  await freeze(page);
  await hush(page);
}

/** Opens the controls on the Learning page, as a parent does. */
async function learningPage(page: Page): Promise<void> {
  await openParent(page);
  await goTo(page, 'Learning');
  await expect(page.getByRole('heading', { name: 'Learning', level: 3 })).toBeVisible();
}

/**
 * Photographs the page from top to bottom, a screenful at a time, so every part of it gets looked
 * at.
 */
async function shotPage(page: Page, name: string): Promise<void> {
  const stage = page.locator('.parent-page');
  const { view, all } = await stage.evaluate((el) => ({ view: el.clientHeight, all: el.scrollHeight }));
  const step = Math.floor(view * 0.85);
  const shots = Math.min(14, Math.ceil(Math.max(0, all - view) / step) + 1);
  for (let i = 0; i < shots; i++) {
    await stage.evaluate((el, top) => (el.scrollTop = top), Math.min(i * step, all - view));
    await shot(page, `${SCRATCH}/${name}-${i + 1}.png`);
  }
  await stage.evaluate((el) => (el.scrollTop = 0));
}

const learning = (page: Page) => page.evaluate(() => window.__ua!.settings.get().learning);
const theSwitch = (page: Page) => page.getByRole('switch', { name: 'Learning mode' });
const choiceOf = (page: Page, name: string) => page.getByRole('radiogroup', { name });
const startNew = (page: Page) => page.getByRole('button', { name: 'Start a new Spell Book' });
const startCard = (page: Page) =>
  page.locator('section.card', { has: page.getByRole('heading', { name: 'Start a new Spell Book' }) });
const copyCard = (page: Page) =>
  page.locator('section.card', { has: page.getByRole('heading', { name: 'Keep a copy' }) });
const saveCopy = (page: Page) => page.getByRole('button', { name: 'Save a copy' });
const addCopy = (page: Page) => page.getByRole('button', { name: 'Add a saved Spell Book…' });
const bookFile = (page: Page) => page.locator('input[type="file"][aria-label="Choose a saved Spell Book file"]');
/** Chooses a file in the chooser a parent is shown, with `text` in it. */
const choose = (page: Page, text: string) =>
  bookFile(page).setInputFiles({ name: 'spell-book.json', mimeType: 'application/json', buffer: Buffer.from(text) });
/** Presses "Save a copy" and returns what the file holds. */
async function saved(page: Page): Promise<{ filename: string; text: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), saveCopy(page).click()]);
  return { filename: download.suggestedFilename(), text: await readFile((await download.path())!, 'utf8') };
}
const words = (page: Page) => page.evaluate(() => Object.keys(window.__ua!.learner.get().words).sort());
/** The number beside a name in the facts at the top of the player's book. */
const fact = (page: Page, label: string) =>
  page.locator('.facts dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');

test.describe('the Learning page', () => {
  test.setTimeout(240_000);

  test("is off at first, with only the switch to turn it on, and the player's book is in the game all the same", async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await playing(page);
    await expect(bookChip(page)).toBeVisible();
    await learningPage(page);
    await expect(theSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('heading', { name: 'Learning mode' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'When it asks' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'How a card looks and sounds' })).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'Spell Book', exact: true }),
      'a book she has not started has nothing to say while learning is off',
    ).toBeHidden();
    await shot(page, `${SCRATCH}/parent-learning-off.png`);
    expect((await learning(page)).on).toBe(false);
    expect(noise).toEqual([]);
  });

  test('the switch turns it on at once: the choices appear, and the book button stays in the game either way', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await playing(page);
    await learningPage(page);
    await theSwitch(page).click();
    await expect(theSwitch(page)).toHaveAttribute('aria-checked', 'true');
    expect((await learning(page)).on).toBe(true);
    for (const heading of ['When it asks', 'How a card looks and sounds', 'Spell Book'])
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText('Kept on this device')).toBeVisible();
    await expect(fact(page, 'Words found')).toHaveText(`0 of ${WORDS}`);
    await shotPage(page, 'parent-learning-on');

    await closeParent(page);
    await expect(bookChip(page)).toBeVisible();
    await openParent(page);
    await expect(
      page.getByRole('heading', { name: 'Learning', level: 3 }),
      'the controls open on the page that was last open',
    ).toBeVisible();
    await theSwitch(page).click();
    await expect(page.getByRole('heading', { name: 'When it asks' })).toBeHidden();
    await closeParent(page);
    await expect(bookChip(page)).toBeVisible();
    expect(noise).toEqual([]);
  });

  test('every choice is saved as it is made, the page shows them again when it is opened, and the card does what was chosen', async ({
    page,
  }) => {
    await playing(page);
    await seedBook(page, { frog: { level: 5, best: 5, due: -1_000 } });
    await learningPage(page);
    await theSwitch(page).click();

    await choiceOf(page, 'How often it asks').getByRole('radio', { name: 'Rarely' }).click();
    await page.getByRole('switch', { name: 'Friends join when their name is spelled' }).click();
    await choiceOf(page, 'Help with a new word').getByRole('radio', { name: 'A little' }).click();
    await choiceOf(page, 'Keyboard').getByRole('radio', { name: 'QWERTY' }).click();
    await choiceOf(page, 'Letters').getByRole('radio', { name: 'small' }).click();
    await page.getByRole('switch', { name: 'Say words and letters aloud' }).click();
    expect(await learning(page)).toEqual({
      on: true,
      say: false,
      keyboard: 'qwerty',
      letters: 'lower',
      help: 'little',
      ask: 'rarely',
      friends: false,
    });

    // Another page and back again, and the page reads the choices from the game and not from
    // itself.
    await goTo(page, 'Sound');
    await goTo(page, 'Learning');
    await expect(choiceOf(page, 'How often it asks').getByRole('radio', { name: 'Rarely' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(choiceOf(page, 'Keyboard').getByRole('radio', { name: 'QWERTY' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(choiceOf(page, 'Letters').getByRole('radio', { name: 'small' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('switch', { name: 'Say words and letters aloud' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await shotPage(page, 'parent-learning-choices');

    // The card the player gets is the card that was chosen.
    await closeParent(page);
    await openBook(page);
    await bookWord(page, 'frog').getByRole('button').click();
    await expect(spellCard(page)).toBeVisible();
    await expect(page.locator('.spell')).toHaveAttribute('data-case', 'lower');
    await expect(page.locator('.spell-keys')).toHaveAttribute('data-layout', 'qwerty');
    await expect(page.locator('.spell-key').first()).toHaveAttribute('data-letter', 'q');
  });

  test('the choices can be made from the keyboard, as the switch can', async ({ page }) => {
    await playing(page);
    await learningPage(page);
    await theSwitch(page).focus();
    await page.keyboard.press('Space');
    await expect(theSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await choiceOf(page, 'How often it asks').getByRole('radio', { name: 'Sometimes' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(choiceOf(page, 'How often it asks').getByRole('radio', { name: 'Rarely' })).toBeFocused();
    expect((await learning(page)).ask).toBe('rarely');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect((await learning(page)).ask).toBe('often');
  });

  test('shows how the player is doing, word by word, and keeps it up to date while it is open', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);

    await expect(fact(page, 'Words found')).toHaveText(`${FOUND} of ${WORDS}`);
    await expect(fact(page, 'Stars')).toHaveText(`${STARS} of ${WORDS * STARS_PER_WORD}`);
    await expect(fact(page, 'Pages finished')).toHaveText(`1 of ${PAGES.length}`);
    await expect(fact(page, 'Ready to be asked again')).toHaveText('2 words');
    await expect(fact(page, 'Trickiest words')).toHaveText('unicorn, bird, bunny');
    await expect(page.getByText('took the most wrong keys each time they were spelled')).toBeVisible();

    const words = page.locator('.words');
    await expect(words.locator('summary')).toHaveText(`Every word found (${FOUND})`);
    await words.locator('summary').click();
    const frog = page.locator('.word-row', { hasText: 'frog' });
    await expect(frog).toContainText('A master');
    await expect(frog).toContainText('Asked again in 14 days');
    await expect(frog.getByRole('img')).toHaveAccessibleName(`${STARS_PER_WORD} of ${STARS_PER_WORD} stars`);
    await expect(page.locator('.word-row', { hasText: 'bird' })).toContainText('Ready to be asked again');
    await expect(page.locator('.word-row', { hasText: 'bunny' })).toContainText('Asked again in 10 minutes');
    await expect(
      page.getByRole('heading', { name: `The Meadow, ${MEADOW.words.length} of ${MEADOW.words.length}` }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The Orchard, 1 of 7' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Unicorn Friends, 1 of 7' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'The Gem Room' }),
      'a page with nothing found is not listed',
    ).toBeHidden();
    await shotPage(page, 'parent-learning-book');

    // She plays on, in another tab, and the page and its open list keep their place and change.
    await seedBook(page, { ...BOOK, ruby: { level: 1 }, topaz: { level: 1 } });
    await expect(fact(page, 'Words found')).toHaveText(`${FOUND + 2} of ${WORDS}`);
    await expect(words.locator('summary')).toHaveText(`Every word found (${FOUND + 2})`);
    expect(await words.evaluate((el) => (el as HTMLDetailsElement).open), 'the list she opened stays open').toBe(true);
    await expect(
      page.getByRole('heading', { name: `The Gem Room, 2 of ${PAGES.find((p) => p.id === 'gem-room')!.words.length}` }),
    ).toBeVisible();
  });

  test('starting a new book asks first, puts the old one away under Recovery, and empties the book', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await playing(page);
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);

    await startNew(page).click();
    const question = page.getByRole('alertdialog', { name: 'Start a new Spell Book?' });
    await expect(question).toBeVisible();
    await expect(question).toContainText(
      `The ${FOUND} words and ${STARS} stars are put away on this device first, so nothing is lost.`,
    );
    await expect(question).toContainText('They stay under Recovery, where they can be downloaded.');
    await shot(page, `${SCRATCH}/parent-learning-start-new.png`);
    // The answer with the focus is the safe one.
    await expect(page.getByRole('button', { name: 'Not now' })).toBeFocused();

    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(question).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(window.__ua!.learner.get().words).length)).toBe(FOUND);

    await startNew(page).click();
    await page.getByRole('button', { name: 'Start a new book' }).click();
    await expect(page.getByText('A new Spell Book is started.')).toBeVisible();
    expect(await page.evaluate(() => window.__ua!.learner.get().words)).toEqual({});
    await expect(fact(page, 'Words found')).toHaveText(`0 of ${WORDS}`);
    await expect(page.locator('.words')).toBeHidden();
    await expect(startNew(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(startCard(page).getByText('The Spell Book has no words in it yet.')).toBeVisible();
    // Playwright waits for a button that says it is unavailable, and a finger does not, so the
    // press is forced.
    await startNew(page).click({ force: true });
    await expect(page.getByRole('alertdialog'), 'a button that cannot be used asks nothing').toHaveCount(0);

    // The old book is on the shelf, and can be downloaded.
    await goTo(page, 'Recovery');
    await expect(page.getByText('the spell book, put aside before it was cleared')).toBeVisible();
    const shelf = page.locator('section.card', { hasText: 'Data that was set aside' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      shelf.getByRole('button', { name: 'Download' }).click(),
    ]);
    const kept = await readFile((await download.path())!, 'utf8');
    expect(JSON.parse(kept).words).toHaveProperty('frog');
    await shot(page, `${SCRATCH}/parent-learning-recovery.png`);
    expect(noise).toEqual([]);
  });

  test('the book put away in a visit that starts from the beginning is under Recovery too, since it is the book that is kept and not the world', async ({
    page,
  }) => {
    await playing(page, 'fresh');
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);
    await startNew(page).click();
    await page.getByRole('button', { name: 'Start a new book' }).click();
    await expect(page.getByText('A new Spell Book is started.')).toBeVisible();
    await goTo(page, 'Recovery');
    await expect(page.getByText('the spell book, put aside before it was cleared')).toBeVisible();
    const shelf = page.locator('section.card', { hasText: 'Data that was set aside' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      shelf.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(JSON.parse(await readFile((await download.path())!, 'utf8')).words).toHaveProperty('frog');
  });

  test('in an incognito visit it says nothing is kept, and there is nothing to start over', async ({ page }) => {
    await playing(page, 'incognito');
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);
    await expect(page.getByText('Incognito: nothing is kept')).toBeVisible();
    await expect(page.getByText('You are in an incognito visit, so these choices are not remembered.')).toBeVisible();
    await expect(startNew(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('This is an incognito visit, so there is nothing kept to start over.')).toBeVisible();
    await startNew(page).click({ force: true });
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await shot(page, `${SCRATCH}/parent-learning-incognito.png`);
  });

  test("when each visit starts from the beginning, the player's book is still kept, and it says so", async ({
    page,
  }) => {
    await playing(page, 'fresh');
    await learningOn(page);
    await learningPage(page);
    await expect(page.getByText('Kept on this device')).toBeVisible();
    await expect(
      page.getByText('The Spell Book is kept even though each visit starts from the beginning.'),
    ).toBeVisible();
  });

  test('the book the player is shown in the game is the one the page counts', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, BOOK);
    await expect(bookChip(page)).toContainText(String(FOUND));
    await openBook(page);
    await expect(spellBook(page).locator('.book-totals')).toHaveAccessibleName(
      `${FOUND} of ${WORDS} words, ${STARS} stars`,
    );
  });
});

test.describe('keeping a copy of the Spell Book', () => {
  test.setTimeout(240_000);

  test("saves the player's book as a file that holds their words and says what it is, and nothing else", async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);
    const file = await saved(page);
    expect(file.filename).toMatch(/^unicorn-academy-spell-book-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = JSON.parse(file.text);
    expect(Object.keys(parsed).sort()).toEqual(['app', 'book', 'exportedAt', 'format', 'kind']);
    expect(parsed).toMatchObject({ app: 'unicorn-academy', kind: 'spell-book', format: 1 });
    expect(Object.keys(parsed.book.words).sort()).toEqual(Object.keys(BOOK).sort());
    await expect(page.getByText('The Spell Book was downloaded. Keep it somewhere safe.')).toBeVisible();
    await shotPage(page, 'parent-learning-copy');
  });

  test('has nothing to save until there is a word, and says so', async ({ page }) => {
    let downloads = 0;
    page.on('download', () => (downloads += 1));
    await playing(page);
    await learningOn(page);
    await learningPage(page);
    await expect(saveCopy(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(copyCard(page).getByText('The Spell Book has no words in it yet.')).toBeVisible();
    await saveCopy(page).click({ force: true });
    await page.waitForTimeout(500);
    expect(downloads, 'a button that cannot be used saves nothing').toBe(0);
    // Adding a saved one is open, since that is how a new device gets its book back.
    await expect(addCopy(page)).toHaveAttribute('aria-disabled', 'false');
  });

  test('shows what is in a chosen file before anything changes, and Cancel changes nothing', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, { frog: { level: 5 } });
    await learningPage(page);
    const file = {
      app: 'unicorn-academy',
      kind: 'spell-book',
      format: 1,
      exportedAt: new Date(Date.now() - 5 * MINUTE).toISOString(),
      book: { schemaVersion: 1, words: { snail: { spell: bookWord1() }, bird: { spell: bookWord1(3) } } },
    };
    await choose(page, JSON.stringify(file));
    const slot = copyCard(page).getByRole('status');
    await expect(slot).toContainText('This file holds a Spell Book');
    await expect(slot).toContainText(`2 words and ${2 * STARS_PER_WORD} stars, saved 5 minutes ago.`);
    await expect(slot).toContainText('2 words are not in the Spell Book yet.');
    await expect(slot).toContainText('Adding it never takes a word or a star away.');
    expect(await words(page), 'looking at a file changes nothing').toEqual(['frog']);
    await shotPage(page, 'parent-learning-preview');

    await slot.getByRole('button', { name: 'Cancel' }).click();
    await expect(slot).toBeEmpty();
    expect(await words(page)).toEqual(['frog']);
    await expect(addCopy(page), 'focus goes back to where she started').toBeFocused();
  });

  test("adds what is in a file to the player's book, keeps every star the player has, and says how many words they have now", async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, { frog: { level: 5, best: 5, done: 6 } });
    await learningPage(page);
    const file = {
      app: 'unicorn-academy',
      kind: 'spell-book',
      format: 1,
      exportedAt: new Date().toISOString(),
      book: { schemaVersion: 1, words: { snail: { spell: bookWord1() }, frog: { spell: bookWord1(1) } } },
    };
    await choose(page, JSON.stringify(file));
    await copyCard(page).getByRole('button', { name: 'Add to the Spell Book' }).click();
    await expect(page.getByText(`Added. The Spell Book now has 2 of ${WORDS} words.`)).toBeVisible();
    expect(await words(page)).toEqual(['frog', 'snail']);
    expect(await page.evaluate(() => window.__ua!.learner.get().words.frog?.spell)).toMatchObject({ best: 5, done: 6 });
    await expect(fact(page, 'Words found')).toHaveText(`2 of ${WORDS}`);
    await expect(copyCard(page).getByRole('status')).toBeEmpty();
    await expect(addCopy(page)).toBeFocused();
    // It is kept: a reload finds the same book.
    await page.evaluate(() => window.__ua!.learner.flush());
    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
    expect(await words(page)).toEqual(['frog', 'snail']);
  });

  test('brings back a book that was started over, from the file the player saved first', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);
    const file = await saved(page);
    await startNew(page).click();
    await page.getByRole('button', { name: 'Start a new book' }).click();
    await expect(fact(page, 'Words found')).toHaveText(`0 of ${WORDS}`);
    expect(await words(page)).toEqual([]);

    await choose(page, file.text);
    await expect(copyCard(page).getByRole('status')).toContainText(`${FOUND} words and ${STARS} stars`);
    await expect(copyCard(page).getByRole('status')).toContainText(`${FOUND} words are not in the Spell Book yet.`);
    await copyCard(page).getByRole('button', { name: 'Add to the Spell Book' }).click();
    await expect(page.getByText(`Added. The Spell Book now has ${FOUND} of ${WORDS} words.`)).toBeVisible();
    await expect(fact(page, 'Words found')).toHaveText(`${FOUND} of ${WORDS}`);
    await expect(fact(page, 'Trickiest words')).toHaveText('unicorn, bird, bunny');
    expect(await words(page)).toEqual(Object.keys(BOOK).sort());
  });

  test('brings back a book from the copy that was put aside under Recovery', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);
    await startNew(page).click();
    await page.getByRole('button', { name: 'Start a new book' }).click();
    await expect(fact(page, 'Words found')).toHaveText(`0 of ${WORDS}`);
    await goTo(page, 'Recovery');
    const shelf = page.locator('section.card', { hasText: 'Data that was set aside' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      shelf.getByRole('button', { name: 'Download' }).click(),
    ]);
    const aside = await readFile((await download.path())!, 'utf8');

    await goTo(page, 'Learning');
    await choose(page, aside);
    await expect(copyCard(page).getByRole('status')).toContainText('This file holds a Spell Book');
    await expect(copyCard(page).getByRole('status'), 'a bare copy has no date to say').not.toContainText('saved');
    await copyCard(page).getByRole('button', { name: 'Add to the Spell Book' }).click();
    await expect(fact(page, 'Words found')).toHaveText(`${FOUND} of ${WORDS}`);
    expect(await words(page)).toEqual(Object.keys(BOOK).sort());
  });

  test('says when a file holds only what the player has, and offers nothing to add', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);
    const file = await saved(page);
    await choose(page, file.text);
    const slot = copyCard(page).getByRole('status');
    await expect(slot).toContainText('The Spell Book has all of this already');
    await expect(slot).toContainText('adding it would change nothing');
    await expect(slot.getByRole('button', { name: 'Add to the Spell Book' })).toHaveCount(0);
    await slot.getByRole('button', { name: 'Close' }).click();
    await expect(slot).toBeEmpty();
  });

  test('refuses what is not a Spell Book in words a parent can read, and the next file can be chosen', async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page);
    await learningPage(page);
    const slot = copyCard(page).getByRole('status');
    const world = JSON.stringify({
      app: 'unicorn-academy',
      format: 1,
      exportedAt: new Date().toISOString(),
      save: { schemaVersion: 1 },
    });
    const newer = JSON.stringify({
      app: 'unicorn-academy',
      kind: 'spell-book',
      format: 2,
      exportedAt: new Date().toISOString(),
      book: {},
    });
    const refused: [string, string][] = [
      ['hello', 'That file is not a Spell Book. It could not be read.'],
      ['{"hello": 1}', 'Nothing in that file could be read as a Spell Book.'],
      [world, 'That file is a saved world, not a Spell Book. A world is loaded under Recovery.'],
      [newer, 'That Spell Book was saved by a newer version of the game. Update the app first.'],
    ];
    for (const [text, reason] of refused) {
      await choose(page, text);
      await expect(slot).toContainText('That file cannot be used');
      await expect(slot).toContainText(reason);
      await expect(slot.getByRole('button', { name: 'Choose a different file…' })).toBeVisible();
      expect(await words(page)).toEqual([]);
    }
    await shotPage(page, 'parent-learning-refused');
  });

  test('is not asked of an incognito visit, which keeps nothing, but a copy can still be saved', async ({ page }) => {
    await playing(page, 'incognito');
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);
    await expect(addCopy(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(
      copyCard(page).getByText(
        'This is an incognito visit, so a Spell Book added now would be forgotten when the page is closed.',
      ),
    ).toBeVisible();
    let chosen = 0;
    page.on('filechooser', () => (chosen += 1));
    await addCopy(page).click({ force: true });
    await page.waitForTimeout(500);
    expect(chosen, 'a button that cannot be used opens no chooser').toBe(0);
    await expect(saveCopy(page)).toHaveAttribute('aria-disabled', 'false');
    const file = await saved(page);
    expect(Object.keys(JSON.parse(file.text).book.words).sort()).toEqual(Object.keys(BOOK).sort());
  });

  test('can be reached from the keyboard, and the file chooser is not in the way of the tab order', async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);
    await saveCopy(page).focus();
    await page.keyboard.press('Tab');
    await expect(addCopy(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(startNew(page)).toBeFocused();
  });
});

test.describe('the Learning page on every screen', () => {
  test.setTimeout(240_000);

  const SCREENS = [
    { name: 'phone-small', width: 568, height: 320 },
    { name: 'phone', width: 915, height: 412 },
    { name: 'phone-tall', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 720 },
  ] as const;

  for (const screen of SCREENS) {
    test(`on a ${screen.name} screen nothing runs off the side, and everything she taps is big enough`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await playing(page);
      await learningOn(page);
      await seedBook(page, BOOK);
      await learningPage(page);
      await page.locator('.words summary').click();
      const found = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>('.parent-page')!;
        const small = [...stage.querySelectorAll<HTMLElement>('.option, .btn, .words summary, .switch')]
          .map((el) => ({
            what: el.textContent?.trim() || el.getAttribute('role') || el.className,
            box: el.getBoundingClientRect(),
          }))
          .filter(({ box }) => box.width > 0 && (box.height < 38 || box.width < 44))
          .map(({ what, box }) => `${what} ${Math.round(box.width)}x${Math.round(box.height)}`);
        return { sideways: stage.scrollWidth - stage.clientWidth, small };
      });
      expect(found.sideways, 'the page is no wider than the sheet').toBeLessThanOrEqual(1);
      expect(found.small, 'things to tap that are smaller than a finger').toEqual([]);
      // The seven pages sit in the list of a phone held sideways without the list having to scroll.
      if (screen.width > 640 && screen.height >= 412) {
        const list = await page.locator('.parent-nav').evaluate((el) => el.scrollHeight - el.clientHeight);
        expect(list, 'the list of pages fits').toBeLessThanOrEqual(1);
      }
      await shotPage(page, `parent-learning-${screen.name}`);
    });
  }
});

/** What a browser says about keeping what is stored here. */
type BrowserSays = { persisted: boolean } | 'throws' | 'has no way to say';

/**
 * Makes the page's browser answer as a given one does, and counts how often it was looked at.
 * Before the page opens, like everything a browser does first.
 */
async function browserSays(page: Page, says: BrowserSays): Promise<void> {
  await page.addInitScript((answer) => {
    const looked = { persisted: 0 };
    Object.assign(window, { __looked: looked });
    const manager =
      answer === 'has no way to say'
        ? undefined
        : {
            persisted: async (): Promise<boolean> => {
              looked.persisted += 1;
              if (answer === 'throws') throw new Error('storage is not available here');
              return answer.persisted;
            },
            // The game asks once when it first saves. That is as it was, and is not what is looked
            // at here.
            persist: async (): Promise<boolean> => false,
          };
    Object.defineProperty(navigator, 'storage', { configurable: true, get: () => manager });
  }, says);
}

/** How many times the page has read what the browser says. */
const looked = (page: Page) =>
  page.evaluate(() => (window as unknown as { __looked: { persisted: number } }).__looked.persisted);
const promise = (page: Page) => page.evaluate(() => window.__ua!.durable.get());

test.describe("whether the browser keeps the player's book", () => {
  test.setTimeout(240_000);

  test('says so when the browser has promised', async ({ page }) => {
    await browserSays(page, { persisted: true });
    await playing(page);
    await learningOn(page);
    await learningPage(page);
    await expect(page.getByText('This browser has promised not to clear it.')).toBeVisible();
    expect(await promise(page)).toBe('promised');
    await shotPage(page, 'parent-learning-promised');
  });

  test("tells a parent that the browser has not promised, and what helps, and says the player's book is being kept all the same", async ({
    page,
  }) => {
    await browserSays(page, { persisted: false });
    await playing(page);
    await learningOn(page);
    await learningPage(page);
    await expect(page.getByText('This browser has not promised to keep it')).toBeVisible();
    await expect(
      page.getByText('Adding the game to the Home Screen helps, and so does saving a copy of the book now and then.'),
    ).toBeVisible();
    expect(await promise(page)).toBe('not-promised');
    await expect(page.getByText('Kept on this device')).toBeVisible();
    await shotPage(page, 'parent-learning-not-promised');
  });

  for (const says of ['has no way to say', 'throws'] as const) {
    test(`says nothing about it when the browser ${says === 'throws' ? 'will not answer' : 'cannot say'}, and the page works as it did`, async ({
      page,
    }) => {
      const noise = watchConsole(page);
      await browserSays(page, says);
      await playing(page);
      await learningOn(page);
      await learningPage(page);
      // A browser that throws was asked, and the page went on. Without this the test would pass for
      // a page that never asked.
      if (says === 'throws') await expect.poll(() => looked(page)).toBeGreaterThan(0);
      await expect(page.getByText('Kept on this device')).toBeVisible();
      await expect(page.getByText(/promised/)).toHaveCount(0);
      expect(await promise(page)).toBe('unknown');
      expect(noise).toEqual([]);
    });
  }

  test('looks only when a parent opens the page, and not while the game is played', async ({ page }) => {
    await browserSays(page, { persisted: true });
    await playing(page);
    await learningOn(page);
    expect(await looked(page), 'nothing has opened the Learning page').toBe(0);
    await learningPage(page);
    await expect.poll(() => looked(page)).toBeGreaterThan(0);
  });

  test('does not say it in a look around, where nothing is kept', async ({ page }) => {
    await browserSays(page, { persisted: false });
    await playing(page, 'incognito');
    await learningOn(page);
    await seedBook(page, BOOK);
    await learningPage(page);
    await expect(page.getByText('Incognito: nothing is kept')).toBeVisible();
    await expect(page.getByText(/promised/)).toHaveCount(0);
  });
});

/**
 * Puts a Spell Book on the device that a newer version of the game wrote, as a second tab running
 * the newer game would.
 */
const lockTheBook = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('unicorn-academy');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('learner', 'readwrite');
          tx.objectStore('learner').put({ schemaVersion: 4, words: {} }, 'profile');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

test.describe('a Spell Book the game cannot keep', () => {
  test.setTimeout(240_000);

  const gear = (page: Page) => page.getByRole('button', { name: GEAR });
  const learningTab = (page: Page) => page.getByRole('tab', { name: 'Learning' });

  test('puts a dot on the gear and on the Learning tab while spelling is on, and the controls open on the Learning page', async ({
    page,
  }) => {
    await playing(page);
    await lockTheBook(page);
    await playing(page);
    await expect(
      gear(page),
      'spelling is off, so nothing she does is written and nothing is wrong',
    ).not.toHaveAttribute('data-attention', 'true');
    await learningOn(page);
    await expect(gear(page)).toHaveAttribute('data-attention', 'true');
    await shot(page, `${SCRATCH}/parent-learning-gear-dot.png`);
    await openParent(page);
    await expect(learningTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(learningTab(page)).toHaveAttribute('data-attention', 'true');
    // The line comes first on the page, where a parent who was sent here reads it, and it is said
    // once.
    await expect(
      page.locator('.page > .card').first().getByText('A newer version wrote this Spell Book'),
    ).toBeVisible();
    await expect(page.getByText('A newer version wrote this Spell Book')).toHaveCount(1);
    await shot(page, `${SCRATCH}/parent-learning-locked.png`);
    // Turning spelling off takes the dot away, from the tab and from the gear.
    await theSwitch(page).click();
    await expect(learningTab(page)).not.toHaveAttribute('data-attention', 'true');
    await closeParent(page);
    await expect(gear(page)).not.toHaveAttribute('data-attention', 'true');
  });

  test('puts the dot on the gear at the moment a write finds the book locked', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await expect(gear(page)).not.toHaveAttribute('data-attention', 'true');
    await lockTheBook(page);
    await seedBook(page, { frog: {} });
    await expect(gear(page)).toHaveAttribute('data-attention', 'true');
  });

  test('has no dot in a look around, where nothing is kept on purpose', async ({ page }) => {
    await playing(page);
    await lockTheBook(page);
    await playing(page, 'incognito');
    await learningOn(page);
    await seedBook(page, { frog: {} });
    await expect(page.getByRole('button', { name: GEAR })).not.toHaveAttribute('data-attention', 'true');
    await learningPage(page);
    await expect(page.getByText('Incognito: nothing is kept')).toBeVisible();
  });
});
