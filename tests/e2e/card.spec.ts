import { expect, type Page, test } from '@playwright/test';
import { PAGES, WORD_IDS } from '../../src/content/lexicon';
import {
  freeze,
  hush,
  keepWord,
  learningOn,
  openGame,
  play,
  SCRATCH,
  seedBook,
  settled,
  shot,
  spellCard,
  spellKey,
  tapWord,
  worldRuns,
} from './helpers';

/**
 * Every screen the card is meant for, and the least a key may be: across and down. Where a screen
 * is short or narrow the keys are as big as it lets them be, and where a row of ten cannot be 44
 * wide on a phone held upright, the keys are narrower and taller, the shape a phone's own keys
 * have.
 */
const SCREENS = [
  { name: 'phone-small', width: 568, height: 320, across: { abc: 40, qwerty: 36 }, down: 40 },
  { name: 'phone', width: 863, height: 360, across: { abc: 44, qwerty: 44 }, down: 44 },
  { name: 'phone-wide', width: 915, height: 412, across: { abc: 44, qwerty: 44 }, down: 44 },
  { name: 'phone-tall', width: 390, height: 844, across: { abc: 44, qwerty: 30 }, down: 44 },
  { name: 'tablet', width: 1024, height: 768, across: { abc: 44, qwerty: 44 }, down: 44 },
  { name: 'desktop', width: 1280, height: 720, across: { abc: 44, qwerty: 44 }, down: 44 },
] as const;

async function playing(page: Page): Promise<void> {
  await openGame(page, 'kept');
  await play(page);
  await page.locator('.title').waitFor({ state: 'hidden' });
  await freeze(page);
  await hush(page);
}

const practice = (page: Page, word: string): Promise<boolean> =>
  page.evaluate((w) => window.__ua!.lessons.practice(w), word);

interface Fit {
  /** Parts of the card that are outside the screen, or outside the card they belong to. */
  outside: string[];
  /** Parts that run into each other when they should sit one above the next. */
  overlapping: string[];
  /** The narrowest key, and the shortest. */
  across: number;
  down: number;
  keys: number;
  /** The card is wider or taller than what it holds, so something is clipped or scrolls. */
  clipped: string[];
}

/**
 * Where everything on the card is, and whether it all fits. Run in the page, since only the page
 * knows where things are.
 */
const measure = (page: Page): Promise<Fit> =>
  page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const rect = (sel: string): DOMRect | null => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
      return el ? el.getBoundingClientRect() : null;
    };
    const card = rect('.spell-card')!;
    const outside: string[] = [];
    const clipped: string[] = [];
    for (const sel of [
      '.spell-card',
      '.spell-frame',
      '.spell-tools',
      '.spell-caption',
      '.spell-slots',
      '.spell-keys',
      '.spell-finish',
      '.spell-shut',
      '.spell-badge',
    ]) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5)
          outside.push(
            `${sel} runs off the screen: ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} of ${vw}x${vh}`,
          );
        // The badge and the close button hang over the edge of the card on purpose. Everything else
        // stays inside it.
        if (
          !['.spell-card', '.spell-badge', '.spell-shut'].includes(sel) &&
          (r.left < card.left - 0.5 ||
            r.top < card.top - 0.5 ||
            r.right > card.right + 0.5 ||
            r.bottom > card.bottom + 0.5)
        ) {
          clipped.push(
            `${sel} is outside the card: ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in ${Math.round(card.left)},${Math.round(card.top)} to ${Math.round(card.right)},${Math.round(card.bottom)}`,
          );
        }
      }
    }
    for (const el of document.querySelectorAll('.spell-caption, .spell-slots, .spell-above')) {
      const e = el as HTMLElement;
      if (e.scrollWidth > e.clientWidth + 1)
        clipped.push(`${e.className} is wider than its room: ${e.scrollWidth} in ${e.clientWidth}`);
    }
    const overlapping: string[] = [];
    const caption = rect('.spell-caption');
    const slots = rect('.spell-slots');
    const keys = rect('.spell-keys');
    const finish = rect('.spell-finish');
    const below =
      keys && keys.height > 0 && getComputedStyle(document.querySelector('.spell-keys')!).visibility !== 'hidden'
        ? keys
        : finish;
    if (caption && slots && caption.bottom > slots.top + 1)
      overlapping.push(
        `the caption (to ${Math.round(caption.bottom)}) runs into the places (from ${Math.round(slots.top)})`,
      );
    if (slots && below && slots.bottom > below.top + 1)
      overlapping.push(
        `the places (to ${Math.round(slots.bottom)}) run into what is below (from ${Math.round(below.top)})`,
      );
    const frame = rect('.spell-frame');
    const work = rect('.spell-work');
    if (
      frame &&
      work &&
      frame.right > work.left + 1 &&
      frame.left < work.right - 1 &&
      frame.bottom > work.top + 1 &&
      frame.top < work.bottom - 1
    )
      overlapping.push('the picture runs into the word and the keys');
    const caps = [...document.querySelectorAll('.spell-key')].map((k) => k.getBoundingClientRect());
    const least = (of: (r: DOMRect) => number): number => (caps.length ? Math.min(...caps.map(of)) : 0);
    return {
      outside,
      overlapping,
      across: least((r) => r.width),
      down: least((r) => r.height),
      keys: caps.length,
      clipped,
    };
  });

test.describe('the card, on every screen, for the longest word', () => {
  test.setTimeout(300_000);

  for (const screen of SCREENS) {
    for (const layout of ['abc', 'qwerty'] as const) {
      test(`fits a ${screen.name} screen with the ${layout} keys from the first letter to the last`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: screen.width, height: screen.height });
        await playing(page);
        await learningOn(page, { keyboard: layout });
        expect(await practice(page, 'strawberry')).toBe(true);
        await expect(spellCard(page)).toBeVisible();
        await settled(page);

        const fresh = await measure(page);
        expect(fresh.keys, 'a key for every letter').toBe(26);
        expect(fresh.outside, 'nothing runs off the screen').toEqual([]);
        expect(fresh.clipped, 'nothing is clipped').toEqual([]);
        expect(fresh.overlapping, 'nothing runs into anything').toEqual([]);
        expect(fresh.across, `every key is at least ${screen.across[layout]} pixels across`).toBeGreaterThanOrEqual(
          screen.across[layout],
        );
        expect(fresh.down, `every key is at least ${screen.down} pixels down`).toBeGreaterThanOrEqual(screen.down);
        await shot(page, `${SCRATCH}/card-${screen.name}-${layout}-1.png`);

        await tapWord(page, 'straw');
        await expect(page.locator('.spell-slot[data-state="placed"]')).toHaveCount(5);
        await settled(page);
        await shot(page, `${SCRATCH}/card-${screen.name}-${layout}-2.png`);

        await tapWord(page, 'berry');
        await expect(page.locator('.spell[data-done="true"]')).toBeVisible();
        // The stars pop in one after another, and the card is looked at when they have.
        await page.waitForTimeout(1800);
        await settled(page);
        const done = await measure(page);
        expect(done.outside).toEqual([]);
        expect(done.clipped).toEqual([]);
        expect(done.overlapping).toEqual([]);
        await shot(page, `${SCRATCH}/card-${screen.name}-${layout}-3.png`);
        await keepWord(page);
      });
    }
  }
});

test.describe('the card, when the phone is turned', () => {
  test.setTimeout(300_000);

  test('keeps the letters the player placed and fits every way the phone is held, then they finish the word', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 863, height: 360 });
    await playing(page);
    await learningOn(page, { keyboard: 'qwerty' });
    expect(await practice(page, 'strawberry')).toBe(true);
    await expect(spellCard(page)).toBeVisible();
    await tapWord(page, 'straw');
    await expect(page.locator('.spell-slot[data-state="placed"]')).toHaveCount(5);

    for (const size of [
      { width: 390, height: 844 },
      { width: 568, height: 320 },
      { width: 1024, height: 768 },
      { width: 863, height: 360 },
    ]) {
      await page.setViewportSize(size);
      await settled(page);
      const fit = await measure(page);
      const where = `on a ${size.width} by ${size.height} screen`;
      expect(fit.outside, `nothing runs off the screen ${where}`).toEqual([]);
      expect(fit.clipped, `nothing is clipped ${where}`).toEqual([]);
      expect(fit.overlapping, `nothing runs into anything ${where}`).toEqual([]);
      expect(fit.keys, `a key for every letter ${where}`).toBe(26);
      // What the player had done is still there, and the next key is still the one that shines.
      await expect(page.locator('.spell-slot[data-state="placed"]')).toHaveCount(5);
      await expect(spellKey(page, 'b')).toHaveAttribute('data-state', 'lit');
    }

    await tapWord(page, 'berry');
    await expect(page.locator('.spell[data-done="true"]')).toBeVisible();
    await keepWord(page);
  });
});

/** The whole Meadow but for ladybug, so that ladybug is the word that finishes the page. */
const MEADOW_BUT_LADYBUG = Object.fromEntries(
  PAGES[0].words.filter((word) => word !== 'ladybug').map((word) => [word, {}]),
);

/** What the player has to have for the next word to be a big moment. */
const MOMENTS = [
  {
    name: 'a round number of words',
    occasion: 'milestone',
    have: { frog: {}, duck: {}, apple: {}, ruby: {} },
    word: 'gold',
    says: 'gold! That is 5 words!',
    badge: { shape: 'rosette', number: '5' },
  },
  {
    name: 'a finished page',
    occasion: 'page',
    have: MEADOW_BUT_LADYBUG,
    word: 'ladybug',
    says: 'ladybug! You finished The Meadow!',
    badge: { shape: 'rosette', number: null },
  },
  {
    name: 'every word in the book',
    occasion: 'everything',
    have: Object.fromEntries(
      WORD_IDS.filter((w) => w !== 'strawberry').map((w) => [w, { level: 5, best: 5, due: 14 * 86_400_000 }]),
    ),
    word: 'strawberry',
    says: 'strawberry! You have every word in the book!',
    badge: { shape: 'crown', number: null },
  },
] as const;

test.describe('a big moment on the card', () => {
  test.setTimeout(300_000);

  for (const moment of MOMENTS) {
    for (const screen of [SCREENS[0], SCREENS[1], SCREENS[3], SCREENS[5]]) {
      test(`${moment.name} shines on the picture and pins a badge to it, on a ${screen.name} screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: screen.width, height: screen.height });
        await playing(page);
        await learningOn(page);
        await seedBook(page, moment.have);
        expect(await practice(page, moment.word)).toBe(true);
        await expect(spellCard(page)).toBeVisible();
        // Nothing marks the moment before the word is done.
        await expect(page.locator('.spell-badge')).toHaveCount(0);
        await expect(page.locator('.spell')).not.toHaveAttribute('data-occasion', /.+/);

        await tapWord(page, moment.word);
        await expect(page.locator('.spell[data-done="true"]')).toBeVisible();
        await expect(page.locator('.spell')).toHaveAttribute('data-occasion', moment.occasion);
        await expect(page.locator('.spell-caption')).toHaveText(moment.says);
        const badge = page.locator('.spell-badge');
        await expect(badge).toHaveCount(1);
        await expect(badge).toHaveAttribute('data-shape', moment.badge.shape);
        if (moment.badge.number === null) await expect(page.locator('.spell-badge-number')).toHaveCount(0);
        else await expect(page.locator('.spell-badge-number')).toHaveText(moment.badge.number);
        // It is only a picture: a screen reader gets the words, and a tap goes through it to the
        // card.
        await expect(badge).toHaveAttribute('aria-hidden', 'true');
        expect(await badge.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

        await page.waitForTimeout(1800);
        await settled(page);
        const fit = await measure(page);
        expect(fit.outside).toEqual([]);
        expect(fit.clipped).toEqual([]);
        expect(fit.overlapping).toEqual([]);
        // The badge sits on the picture's corner and stays clear of the close button.
        const apart = await page.evaluate(() => {
          const b = document.querySelector('.spell-badge')!.getBoundingClientRect();
          const x = document.querySelector('.spell-shut')!.getBoundingClientRect();
          const f = document.querySelector('.spell-frame')!.getBoundingClientRect();
          return {
            overShut: !(b.right <= x.left || b.left >= x.right || b.bottom <= x.top || b.top >= x.bottom),
            onFrame: b.right > f.left && b.left < f.right && b.bottom > f.top && b.top < f.bottom,
          };
        });
        expect(apart.overShut, 'the badge does not cover the close button').toBe(false);
        expect(apart.onFrame, 'the badge is on the picture').toBe(true);
        await shot(page, `${SCRATCH}/card-moment-${moment.occasion}-${screen.name}.png`);

        // A tap on the finished card, even on the badge, goes on as it always does.
        await keepWord(page);
        await expect(page.locator('.spell-badge')).toHaveCount(0);
      });
    }
  }

  test('a new star alone and a word the player knew already get no badge, and the next card starts clean', async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page);
    expect(await practice(page, 'frog')).toBe(true);
    await tapWord(page, 'frog');
    await expect(page.locator('.spell')).toHaveAttribute('data-occasion', 'star');
    await expect(page.locator('.spell-badge')).toHaveCount(0);
    await keepWord(page);
    // The next card is a new card, with nothing left over from the one before.
    await seedBook(page, MEADOW_BUT_LADYBUG);
    expect(await practice(page, 'ladybug')).toBe(true);
    await expect(page.locator('.spell-badge')).toHaveCount(0);
    await expect(page.locator('.spell')).not.toHaveAttribute('data-occasion', /.+/);
    await tapWord(page, 'ladybug');
    await expect(page.locator('.spell')).toHaveAttribute('data-occasion', 'page');
    await keepWord(page);
  });

  test('with fewer effects the badge is there and nothing moves', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await seedBook(page, MEADOW_BUT_LADYBUG);
    expect(await practice(page, 'ladybug')).toBe(true);
    await tapWord(page, 'ladybug');
    await expect(page.locator('.spell-badge')).toBeVisible();
    // A transition that is finishing is not an animation of the card, so only what the stylesheet
    // animates is counted.
    const moving = await page.evaluate(
      () =>
        [...document.querySelectorAll('.spell, .spell *')]
          .flatMap((el) => el.getAnimations({ subtree: false }))
          .filter((a) => 'animationName' in a && a.playState === 'running').length,
    );
    expect(moving, 'no animation runs on the card').toBe(0);
    await expect(page.locator('.spell-badge')).toHaveCSS('opacity', '1');
    await shot(page, `${SCRATCH}/card-moment-calm.png`);
    await keepWord(page);
  });
});

test.describe('going on from a finished card', () => {
  test.setTimeout(300_000);

  test('a tap in the instant the last letter lands does not skip the celebration, and a tap a moment later goes on', async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page);
    expect(await practice(page, 'frog')).toBe(true);
    await expect(spellCard(page)).toBeVisible();
    // The tap is made inside the page, in the same breath as the card saying the word is done,
    // which is as soon as a tap can come.
    const early = page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const card = document.querySelector<HTMLElement>('.spell')!;
          const watch = new MutationObserver(() => {
            if (card.dataset.done !== 'true') return;
            watch.disconnect();
            document.querySelector<HTMLElement>('.spell-collect')!.click();
            resolve(card.isConnected);
          });
          watch.observe(card, { attributes: true, attributeFilter: ['data-done'] });
        }),
    );
    await tapWord(page, 'frog');
    expect(await early, 'the card is still there after the early tap').toBe(true);
    await expect(page.locator('.spell[data-done="true"]')).toBeVisible();
    await keepWord(page);
  });

  test('Enter and Space go on from a finished card, as a tap does', async ({ page }) => {
    await playing(page);
    await learningOn(page);
    for (const [word, key] of [
      ['frog', 'Enter'],
      ['duck', 'Space'],
    ] as const) {
      expect(await practice(page, word)).toBe(true);
      await expect(spellCard(page)).toBeVisible();
      await tapWord(page, word);
      await expect(page.locator('.spell[data-done="true"]')).toBeVisible();
      // The first moments after the last letter are not counted, so a key that did not take is
      // pressed again.
      await expect(async () => {
        if ((await page.locator('.spell').count()) > 0) await page.keyboard.press(key);
        await expect(page.locator('.spell')).toHaveCount(0, { timeout: 1000 });
      }).toPass({ intervals: [0, 250, 500], timeout: 30_000 });
      expect(await worldRuns(page)).toBe(true);
    }
  });
});
