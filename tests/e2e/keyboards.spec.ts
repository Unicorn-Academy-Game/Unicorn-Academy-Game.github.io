import { expect, type Page, test } from '@playwright/test';
import { WORD_IDS } from '../../src/content/lexicon';
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
  tapWord,
} from './helpers';

/**
 * Every on-screen keyboard in the game, on the screens it is played on. There are two: the letters
 * of the spell card, and the letters of the manor door's secret word. A key that is off the screen
 * cannot be pressed, so what is asked here is what a thumb needs: every key is on the screen, clear
 * of the notch and the home bar, big enough to hit, not on top of another key and not under
 * something else.
 *
 * The sizes are what a page is given, not what the phone's screen is. A browser's own bars take
 * their share of a phone, so an iPhone 14 held upright gives a page 390 by 664 in Safari, and 844
 * by 390 is the whole of it held sideways in an installed game. The notch and the home bar are the
 * page's `--safe-*` values, which a test sets by hand since the test browser has none.
 */
interface Screen {
  name: string;
  width: number;
  height: number;
  /**
   * What the notch, the status bar and the home bar take from the page, in the order the page's own
   * variables name them.
   */
  safe?: { top?: number; right?: number; bottom?: number; left?: number };
  /**
   * The least a key may be across and down, for a thumb, on each keyboard. A narrow screen cannot
   * give a row of keys what a wide one can.
   */
  least: { pad: number; card: number };
}

const SCREENS: readonly Screen[] = [
  // Held upright.
  { name: 'phone-narrowest-upright', width: 320, height: 460, least: { pad: 32, card: 32 } },
  { name: 'iphone-se-upright', width: 375, height: 553, least: { pad: 40, card: 40 } },
  { name: 'android-small-upright', width: 360, height: 560, least: { pad: 38, card: 38 } },
  { name: 'iphone-14-upright-in-safari', width: 390, height: 664, least: { pad: 42, card: 40 } },
  {
    name: 'iphone-14-upright-installed',
    width: 390,
    height: 844,
    safe: { top: 47, bottom: 34 },
    least: { pad: 42, card: 40 },
  },
  { name: 'pixel-7-upright', width: 412, height: 780, least: { pad: 45, card: 40 } },
  { name: 'iphone-pro-max-upright', width: 430, height: 739, least: { pad: 48, card: 40 } },
  // Held sideways.
  { name: 'phone-smallest-sideways', width: 568, height: 300, least: { pad: 36, card: 34 } },
  { name: 'iphone-se-sideways', width: 667, height: 320, least: { pad: 42, card: 36 } },
  { name: 'android-small-sideways', width: 740, height: 312, least: { pad: 39, card: 36 } },
  {
    name: 'iphone-14-sideways-in-safari',
    width: 844,
    height: 342,
    safe: { left: 47, right: 47 },
    least: { pad: 49, card: 36 },
  },
  {
    name: 'iphone-14-sideways-installed',
    width: 844,
    height: 390,
    safe: { left: 47, right: 47, bottom: 21 },
    least: { pad: 53, card: 38 },
  },
  { name: 'pixel-7-sideways', width: 915, height: 360, least: { pad: 50, card: 38 } },
  {
    name: 'iphone-pro-max-sideways',
    width: 932,
    height: 360,
    safe: { left: 59, right: 59, bottom: 21 },
    least: { pad: 48, card: 38 },
  },
  // Tablets, and a computer.
  { name: 'ipad-upright', width: 768, height: 930, least: { pad: 53, card: 44 } },
  { name: 'ipad-sideways', width: 1024, height: 690, least: { pad: 53, card: 44 } },
  { name: 'fire-upright', width: 800, height: 1180, least: { pad: 53, card: 44 } },
  { name: 'fire-sideways', width: 1280, height: 750, least: { pad: 53, card: 44 } },
  { name: 'desktop', width: 1280, height: 720, least: { pad: 53, card: 44 } },
];

async function playing(page: Page): Promise<void> {
  await openGame(page, 'kept');
  await play(page);
  await page.locator('.title').waitFor({ state: 'hidden' });
  await freeze(page);
  await hush(page);
}

/**
 * Puts the page on a screen: its size, and the margins a notch and a home bar would take, which the
 * page reads from `--safe-*`.
 */
async function onScreen(page: Page, screen: Screen): Promise<void> {
  await page.setViewportSize({ width: screen.width, height: screen.height });
  await page.evaluate((safe) => {
    const root = document.documentElement.style;
    for (const side of ['top', 'right', 'bottom', 'left'] as const)
      root.setProperty(`--safe-${side}`, `${safe?.[side] ?? 0}px`);
  }, screen.safe);
  await settled(page);
}

interface Look {
  keys: number;
  /** The narrowest key and the shortest. */
  across: number;
  down: number;
  problems: string[];
}

/**
 * Where every key of a keyboard is, and what is wrong with it. Run in the page, since only the page
 * knows where things are. `parts` are other things that must be whole on the screen: the card the
 * keys are on, the close button that hangs over its corner, the boxes the word is spelled in.
 */
const look = (
  page: Page,
  o: { keys: string; parts: string[]; clear: { of: string; from: string[] }; holds: string[]; safe: Screen['safe'] },
): Promise<Look> =>
  page.evaluate(({ keys, parts, clear, holds, safe }) => {
    const left = safe?.left ?? 0;
    const top = safe?.top ?? 0;
    const right = innerWidth - (safe?.right ?? 0);
    const bottom = innerHeight - (safe?.bottom ?? 0);
    const problems: string[] = [];
    const where = (r: DOMRect): string =>
      `${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)}`;
    const name = (el: Element): string =>
      (el as HTMLElement).dataset.letter ?? el.getAttribute('aria-label') ?? el.className.toString();
    const seen = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const caps = [...document.querySelectorAll(keys)].filter(seen);
    for (const cap of caps) {
      const r = cap.getBoundingClientRect();
      if (r.left < left - 0.5 || r.top < top - 0.5 || r.right > right + 0.5 || r.bottom > bottom + 0.5)
        problems.push(`key ${name(cap)} is off the screen: ${where(r)} of ${left},${top} to ${right},${bottom}`);
      const hit = document.elementFromPoint(
        Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1),
        Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1),
      );
      if (!hit || !cap.contains(hit))
        problems.push(
          `key ${name(cap)} has ${hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'nothing'} over its middle`,
        );
    }
    for (let i = 0; i < caps.length; i++) {
      for (let j = i + 1; j < caps.length; j++) {
        const a = caps[i]!.getBoundingClientRect();
        const b = caps[j]!.getBoundingClientRect();
        const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (across > 1 && down > 1)
          problems.push(`keys ${name(caps[i]!)} and ${name(caps[j]!)} are on top of each other`);
      }
    }
    for (const sel of parts) {
      for (const el of [...document.querySelectorAll(sel)].filter(seen)) {
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)
          problems.push(`${sel} runs off the screen: ${where(r)} of ${innerWidth}x${innerHeight}`);
      }
    }
    for (const edge of document.querySelectorAll(clear.of)) {
      const hanging = edge.getBoundingClientRect();
      for (const sel of clear.from) {
        for (const el of [...document.querySelectorAll(sel)].filter(seen)) {
          const r = el.getBoundingClientRect();
          const across = Math.min(hanging.right, r.right) - Math.max(hanging.left, r.left);
          const down = Math.min(hanging.bottom, r.bottom) - Math.max(hanging.top, r.top);
          if (across > 1 && down > 1)
            problems.push(`${clear.of} is on top of ${sel}: ${where(hanging)} and ${where(r)}`);
        }
      }
    }
    // A card that has more in it than it is tall has something hanging out of the bottom. The close
    // button and the badge hang out of the top, which does not count.
    for (const sel of holds) {
      for (const el of [...document.querySelectorAll(sel)].filter(seen))
        if (el.scrollHeight > el.clientHeight + 1)
          problems.push(`${sel} has more in it than it is tall: ${el.scrollHeight} in ${el.clientHeight}`);
    }
    const page = document.scrollingElement!;
    if (page.scrollWidth > innerWidth + 1 || page.scrollHeight > innerHeight + 1)
      problems.push(`the page scrolls: ${page.scrollWidth}x${page.scrollHeight} in ${innerWidth}x${innerHeight}`);
    const least = (of: (r: DOMRect) => number): number =>
      caps.length ? Math.min(...caps.map((c) => of(c.getBoundingClientRect()))) : 0;
    return { keys: caps.length, across: least((r) => r.width), down: least((r) => r.height), problems };
  }, o);

/** What is wrong on a screen, in words, or nothing. */
function wrongOn(screen: Screen, found: Look, wanted: number, least: number): string[] {
  const out = found.problems.map((p) => `${screen.name}: ${p}`);
  if (found.keys !== wanted) out.push(`${screen.name}: ${found.keys} keys are showing and ${wanted} are wanted`);
  if (found.across < least)
    out.push(`${screen.name}: the narrowest key is ${found.across.toFixed(1)} across, and ${least} is the least`);
  if (found.down < least)
    out.push(`${screen.name}: the shortest key is ${found.down.toFixed(1)} down, and ${least} is the least`);
  return out;
}

/**
 * The close button hangs over the corner of the card, so it must be clear of the words and the
 * letters that are near the corner.
 */
const CODE_PAD = {
  keys: '.codepad-key',
  parts: ['.codepad-card', '.codepad-shut', '.codepad-box'],
  clear: {
    of: '.codepad-shut',
    from: ['.codepad-title h2', '.codepad-lock', '.codepad-hint', '.codepad-box', '.codepad-key'],
  },
  holds: ['.codepad-card'],
};

const SPELL_CARD = {
  parts: ['.spell-card', '.spell-shut', '.spell-slot'],
  clear: { of: '.spell-shut', from: ['.spell-key', '.spell-slot', '.spell-picture'] },
  holds: ['.spell-card'],
};

test.describe('the on-screen keyboards, on every screen they are played on', () => {
  test.setTimeout(300_000);

  test('the manor door pad keeps every letter, Back and Go on the screen, big enough, and clear of everything else', async ({
    page,
  }) => {
    await playing(page);
    await page.evaluate(() =>
      (window as unknown as { __ua: { pad: { open(door: string): void } } }).__ua.pad.open('forest/manor-door-1'),
    );
    await expect(page.locator('.codepad-card')).toBeVisible();

    const wrong: string[] = [];
    // 26 letters, Back and Go. Once with the boxes empty, and once with the most letters the pad
    // takes, which makes the word the longest it can be.
    for (const typed of ['', 'abcdefghijkl']) {
      await page.evaluate((word) => {
        const pad = (
          window as unknown as { __ua: { pad: { add(l: string): void; back(): void; state: { typed: string } } } }
        ).__ua.pad;
        while (pad.state.typed) pad.back();
        for (const letter of word) pad.add(letter);
      }, typed);
      for (const screen of SCREENS) {
        await onScreen(page, screen);
        const found = await look(page, { ...CODE_PAD, safe: screen.safe });
        wrong.push(
          ...wrongOn(screen, found, 28, screen.least.pad).map(
            (w) => `${typed ? 'twelve letters typed' : 'nothing typed'}, ${w}`,
          ),
        );
        await shot(page, `${SCRATCH}/keyboards/pad-${screen.name}${typed ? '-typed' : ''}.png`);
      }
    }
    expect(wrong, 'every key is where a thumb can reach it').toEqual([]);
  });

  for (const layout of ['abc', 'qwerty'] as const) {
    test(`the spell card keeps every letter on the screen, big enough, and clear of everything else with the ${layout} keys`, async ({
      page,
    }) => {
      await playing(page);
      await learningOn(page, { keyboard: layout });
      expect(await page.evaluate(() => window.__ua!.lessons.practice('strawberry'))).toBe(true);
      await expect(spellCard(page)).toBeVisible();

      const wrong: string[] = [];
      for (const screen of SCREENS) {
        await onScreen(page, screen);
        const found = await look(page, { ...SPELL_CARD, keys: '.spell-key', safe: screen.safe });
        // The keys of a qwerty keyboard are ten across, and no phone held upright can make them
        // what the others are. A phone's own keys are about as narrow.
        const narrowest = screen.width < 340 ? 24 : 28;
        const least =
          layout === 'qwerty' && screen.width < 500 && screen.height > screen.width
            ? Math.min(screen.least.card, narrowest)
            : screen.least.card;
        wrong.push(...wrongOn(screen, found, 26, least));
        await shot(page, `${SCRATCH}/keyboards/card-${layout}-${screen.name}.png`);
      }
      expect(wrong, 'every key is where a thumb can reach it').toEqual([]);
    });
  }

  test('the finished spell card keeps its words, stars, badge and button on the screen, with the longest thing it says', async ({
    page,
  }) => {
    await playing(page);
    await learningOn(page, { keyboard: 'abc' });
    // Every word but one is known, so the last one is the biggest moment there is: the longest
    // praise, and a crown on the picture.
    await seedBook(
      page,
      Object.fromEntries(
        WORD_IDS.filter((w) => w !== 'strawberry').map((w) => [w, { level: 5, best: 5, due: 14 * 86_400_000 }]),
      ),
    );
    expect(await page.evaluate(() => window.__ua!.lessons.practice('strawberry'))).toBe(true);
    await expect(spellCard(page)).toBeVisible();
    await tapWord(page, 'strawberry');
    await expect(page.locator('.spell[data-done="true"]')).toBeVisible();
    await expect(page.locator('.spell-badge')).toHaveCount(1);
    // The stars pop in one after another, and the card is looked at when they have.
    await page.waitForTimeout(1800);

    const wrong: string[] = [];
    for (const screen of SCREENS) {
      await onScreen(page, screen);
      const found = await look(page, {
        keys: '.spell-collect',
        parts: ['.spell-card', '.spell-shut', '.spell-caption', '.spell-stars', '.spell-frame', '.spell-badge'],
        clear: { of: '.spell-badge', from: ['.spell-shut', '.spell-collect', '.spell-caption'] },
        holds: SPELL_CARD.holds,
        safe: screen.safe,
      });
      wrong.push(...wrongOn(screen, found, 1, 40));
      await shot(page, `${SCRATCH}/keyboards/card-done-${screen.name}.png`);
    }
    await keepWord(page);
    expect(wrong, 'everything she needs to go on is where a thumb can reach it').toEqual([]);
  });
});
