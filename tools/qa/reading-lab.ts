import { type Browser, chromium, type Page } from '@playwright/test';
import { type ItemScene, LONGEST } from '../lab/reading-views';
import { ORIGIN } from './origin';
import { silence } from './silence';

/**
 * What the tools that look at the reading computer's screen share: `reading-shot.ts`,
 * `reading-fit.ts` and `reading-sweep.ts`, which `tests/e2e/reading-layout.spec.ts` runs. They use
 * the reading lab page (`tools/lab/reading.html`): the real screen with nothing else of the game
 * around it, which loads in a moment, can be resized as often as is wanted, and can put up any view
 * of the course (any word, any sentence, any state of either) with no session behind it. The lab
 * has no voice and plays nothing, so none of this makes a sound. Run `pnpm exec vite --port 5173
 * --strictPort` first (the port is `UA_PORT`, as for the tests).
 */

export type Size = readonly [width: number, height: number, name: string];

/** The screens a child could hold, upright and sideways, and the windows a grown-up could open. */
const SIZES: readonly Size[] = [
  [320, 568, 'iPhone SE'],
  [360, 640, 'small Android'],
  [375, 667, 'iPhone 8'],
  [380, 700, 'a phone at 380'],
  [381, 700, 'a phone at 381'],
  [390, 844, 'iPhone 14'],
  [414, 896, 'iPhone 11'],
  [420, 800, 'a phone at 420'],
  [421, 800, 'a phone at 421'],
  [430, 932, 'iPhone 15 Pro Max'],
  [720, 540, 'upright at the breakpoint'],
  [768, 1024, 'iPad'],
  [820, 1180, 'iPad Air'],
  [1024, 1366, 'iPad Pro 12.9'],
  [500, 500, 'a square'],
  [568, 320, 'iPhone SE sideways'],
  [640, 360, 'small Android sideways'],
  [667, 375, 'iPhone 8 sideways'],
  [720, 539, 'sideways at the breakpoint'],
  [721, 500, 'just wider'],
  [740, 360, 'Android sideways'],
  [812, 375, 'iPhone X sideways'],
  [844, 390, 'iPhone 14 sideways'],
  [896, 414, 'iPhone 11 sideways'],
  [932, 430, 'iPhone 15 Pro Max sideways'],
  [1024, 768, 'iPad sideways'],
  [1366, 1024, 'iPad Pro sideways'],
  [1280, 720, 'a laptop'],
  [1440, 900, 'a bigger laptop'],
  [1920, 1080, 'a monitor'],
  [2560, 1440, 'a big monitor'],
];

/**
 * The shortest screen the game is made for. A pane that has to be scrolled on a screen shorter than
 * this is a warning, and on one this tall a problem.
 */
const LEAST_HEIGHT = 320;

/**
 * Fewer sizes that still stand either side of every place the screen changes: the narrowest, the
 * shortest, each breakpoint, and the biggest.
 */
export const FEW_SIZES: readonly Size[] = SIZES.filter(([w, h]) =>
  [
    '320x568',
    '380x700',
    '381x700',
    '420x800',
    '421x800',
    '390x844',
    '720x540',
    '768x1024',
    '500x500',
    '568x320',
    '720x539',
    '721x500',
    '844x390',
    '1280x720',
    '2560x1440',
  ].includes(`${w}x${h}`),
);

/**
 * Which of the sizes a tool was asked for: `all`, `few`, `upright`, `sideways`, or a list such as
 * `390x844,863x360`.
 */
export function sizesFor(which: string): readonly Size[] {
  if (which === 'all') return SIZES;
  if (which === 'few') return FEW_SIZES;
  if (which === 'upright') return SIZES.filter(([w, h]) => w < h);
  if (which === 'sideways') return SIZES.filter(([w, h]) => w >= h);
  return which.split(',').map((text): Size => {
    const [w = 0, h = 0] = text.split('x').map(Number);
    return [w, h, text];
  });
}

type Views = {
  item: ItemScene;
  home: Record<string, unknown>;
  map: Record<string, unknown>;
  done: Record<string, unknown>;
};

/** A view of the screen, and what it is called in a table. */
export type Scene = { [K in keyof Views]: { name: string; kind: K; scene: Views[K] } }[keyof Views];

const EARNED = { clean: true, reads: true, cleared: 7, chapter: 'The Pond', told: false, everything: false } as const;
const ALL_EARNED = { ...EARNED, cleared: 85, chapter: 'Unicorn Land', everything: true } as const;
const every = Array.from({ length: 39 }, (_, i) => i + 1);

/**
 * Every state of the screen that is laid out differently from another, from the shortest word to
 * the longest sentence.
 */
export const SCENES: readonly Scene[] = [
  { name: 'cat, nothing touched', kind: 'item', scene: { word: 'cat' } },
  { name: 'cat, the next glows', kind: 'item', scene: { word: 'cat', touched: 1, glowing: 1 } },
  { name: 'cat, can ask for help', kind: 'item', scene: { word: 'cat', touched: 2, canHelp: true } },
  { name: 'cake, the magic e glows', kind: 'item', scene: { word: 'cake', touched: 1, glowing: 1 } },
  { name: 'cake, say it', kind: 'item', scene: { word: 'cake', phase: 'saying' } },
  { name: 'cake, say it, the first time', kind: 'item', scene: { word: 'cake', phase: 'saying', hint: true } },
  { name: 'cake, say it, with no voice', kind: 'item', scene: { word: 'cake', phase: 'saying', speech: false } },
  { name: 'cake, found', kind: 'item', scene: { word: 'cake', phase: 'found' } },
  { name: 'cake, found, a level cleared', kind: 'item', scene: { word: 'cake', phase: 'found', earned: EARNED } },
  {
    name: 'cake, found, the whole course',
    kind: 'item',
    scene: { word: 'cake', phase: 'found', stage: 85, earned: ALL_EARNED },
  },
  { name: `${LONGEST.word}, three touched`, kind: 'item', scene: { word: LONGEST.word, touched: 3, glowing: 3 } },
  {
    name: `${LONGEST.word}, say it, the first time`,
    kind: 'item',
    scene: { word: LONGEST.word, phase: 'saying', hint: true },
  },
  { name: `${LONGEST.manyTiles}, nothing touched`, kind: 'item', scene: { word: LONGEST.manyTiles } },
  {
    name: `${LONGEST.manyTiles}, say it, the first time`,
    kind: 'item',
    scene: { word: LONGEST.manyTiles, phase: 'saying', hint: true },
  },
  { name: 'playground, found', kind: 'item', scene: { word: 'playground', phase: 'found', earned: EARNED } },
  { name: 'butterfly at the last level', kind: 'item', scene: { word: 'butterfly', stage: 85, touched: 2 } },
  { name: 'the shortest sentence', kind: 'item', scene: { line: LONGEST.shortLine, touched: 1, glowing: 1 } },
  { name: 'the longest sentence, four touched', kind: 'item', scene: { line: LONGEST.line, touched: 4, glowing: 4 } },
  { name: 'the longest sentence, together', kind: 'item', scene: { line: LONGEST.line, phase: 'saying' } },
  {
    name: 'the longest sentence, found',
    kind: 'item',
    scene: { line: LONGEST.line, phase: 'found', earned: ALL_EARNED },
  },
  {
    name: 'the sentence with the longest word',
    kind: 'item',
    scene: { line: LONGEST.wordLine, touched: 3, glowing: 3 },
  },
  { name: 'home', kind: 'home', scene: {} },
  { name: 'home, the first time', kind: 'home', scene: { first: true } },
  { name: 'home, the last level', kind: 'home', scene: { stage: 85, words: 945, lines: 608 } },
  { name: 'levels, the first', kind: 'map', scene: { stage: 1, mastered: [] } },
  { name: 'levels, in the middle', kind: 'map', scene: {} },
  { name: 'levels, the last', kind: 'map', scene: { stage: 85, mastered: every } },
  { name: 'done', kind: 'done', scene: {} },
  { name: 'done, a level cleared', kind: 'done', scene: { cleared: 7, chapter: 'The Pond' } },
  {
    name: 'done, the whole course',
    kind: 'done',
    scene: { stage: 85, cleared: 85, chapter: 'Unicorn Land', everything: true },
  },
  { name: 'done, none read', kind: 'done', scene: { read: 0, fresh: 0 } },
];

/**
 * A thing to read, walked through the three phases it goes through, to see that it does not change
 * size as the player touches it, says it and finds it.
 */
export interface Walk {
  name: string;
  scene: (phase: 'touching' | 'saying' | 'found') => ItemScene;
}

export const WALKS: readonly Walk[] = [
  { name: 'cat', scene: (phase) => ({ word: 'cat', phase }) },
  { name: 'cake', scene: (phase) => ({ word: 'cake', phase }) },
  { name: LONGEST.word, scene: (phase) => ({ word: LONGEST.word, phase }) },
  {
    name: `${LONGEST.manyTiles}, the first time`,
    scene: (phase) => ({ word: LONGEST.manyTiles, phase, hint: phase === 'saying' }),
  },
  { name: 'the shortest sentence', scene: (phase) => ({ line: LONGEST.shortLine, phase }) },
  { name: 'the longest sentence', scene: (phase) => ({ line: LONGEST.line, phase }) },
  { name: 'the sentence with the longest word', scene: (phase) => ({ line: LONGEST.wordLine, phase }) },
];

/**
 * The scenes a test holds to zero problems: one of each way the screen is laid out, and the
 * extremes of each.
 */
export const FEW_SCENES: readonly Scene[] = SCENES.filter(({ name }) =>
  [
    'cat, nothing touched',
    'cake, the magic e glows',
    'cake, say it, the first time',
    'cake, found, the whole course',
    `${LONGEST.word}, three touched`,
    `${LONGEST.manyTiles}, say it, the first time`,
    'playground, found',
    'the shortest sentence',
    'the longest sentence, four touched',
    'the longest sentence, together',
    'the longest sentence, found',
    'the sentence with the longest word',
    'home',
    'home, the first time',
    'home, the last level',
    'levels, the first',
    'levels, the last',
    'done, a level cleared',
    'done, the whole course',
  ].includes(name),
);

/** The arguments of a tool, read the way every tool here reads them. */
export function argsOf(argv: readonly string[]): {
  has: (name: string) => boolean;
  value: (name: string, fallback: string) => string;
} {
  return {
    has: (name) => argv.includes(`--${name}`),
    value: (name, fallback) => {
      const at = argv.indexOf(`--${name}`);
      return at >= 0 ? (argv[at + 1] ?? fallback) : fallback;
    },
  };
}

/**
 * What a tool is told to open the lab with: the screen it starts at, fewer effects, whether the
 * voice is on and the buttons of the corner.
 */
export interface LabOptions {
  width: number;
  height: number;
  dpr: number;
  calm: boolean;
  voice: boolean;
  hud: 2 | 3;
  origin: string;
}

export function optionsOf(argv: readonly string[]): LabOptions {
  const args = argsOf(argv);
  return {
    width: Number(args.value('w', '844')),
    height: Number(args.value('h', '390')),
    dpr: Number(args.value('dpr', '1')),
    calm: args.has('calm'),
    voice: !args.has('no-voice'),
    hud: args.has('two-buttons') ? 2 : 3,
    origin: args.value('origin', ORIGIN),
  };
}

export interface Lab {
  browser: Browser;
  page: Page;
}

/** The lab page, loaded. */
export async function openLab(o: LabOptions): Promise<Lab> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: o.width, height: o.height },
    deviceScaleFactor: o.dpr,
    hasTouch: true,
  });
  await silence(context);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  // tsx names every function it compiles with a helper that a page does not have, so the page is
  // given one that does nothing.
  await page.addInitScript('window.__name = (f) => f;');
  await page.goto(`${o.origin}/tools/lab/reading.html?${labQuery(o)}`);
  await page.waitForFunction(() => (window as unknown as { lab?: unknown }).lab !== undefined, undefined, {
    timeout: 120_000,
  });
  return { browser, page };
}

/** What the lab page is told in its address. */
export const labQuery = (o: LabOptions): string =>
  new URLSearchParams({ calm: o.calm ? '1' : '0', speech: o.voice ? '1' : '0', hud: String(o.hud) }).toString();

/** Puts a view on the screen, new, as it is when the player sits down at it. */
export async function show(page: Page, scene: Scene): Promise<void> {
  await page.evaluate(
    ([kind, view]) => {
      const lab = (
        window as unknown as {
          lab: { close(): void; show(view: unknown): void; views: Record<string, (scene: unknown) => unknown> };
        }
      ).lab;
      lab.close();
      lab.show(lab.views[kind as string]!(view));
    },
    [scene.kind, scene.scene] as const,
  );
}

/** What a look at the screen finds. */
export interface Metrics {
  /**
   * What a child would see cut off, on top of another thing, out of reach or too small to use. One
   * line each.
   */
  problems: string[];
  /** What is close to that. */
  warnings: string[];
  /** What the screen is made of, for a person reading the table. */
  shape: string;
  /** The smallest thing the player taps, and the smallest words they read, in pixels. */
  target: number;
  text: number;
}

/**
 * Waits until what is moving has stopped, and what shines or rests for ever is not waited for. A
 * glide or a fade is run by the page's frames, so on a machine that draws slowly it is still on its
 * way long after any fixed wait, and a tile that is still arriving is measured where it is and not
 * where it will be. The font is waited for too, since a word is laid out by how wide its letters
 * are.
 *
 * Two frames go by before what is moving is looked at. A screen answers a new size in the first
 * frame that comes after it: a resize observer is called once that frame's own callbacks have run,
 * the tiles are laid out again, and the gap between them, which takes half a second to open or
 * close, starts to move then. On a machine that is short of time that frame can come after this
 * function has begun, and a look taken before it finds nothing moving and measures a row that is
 * still as wide as it was at the old size.
 */
export async function stopped(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));
    const moving = (): Animation[] =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
    await frame();
    await frame();
    for (let round = 0; round < 8 && moving().length > 0; round++) {
      await Promise.all(moving().map((a) => a.finished.catch(() => undefined)));
      await frame();
    }
  });
}

/** Measures the screen as it is now, once what is moving has stopped. */
export async function measure(page: Page): Promise<Metrics> {
  await stopped(page);
  return page.evaluate((leastHeight) => {
    const problems: string[] = [];
    const warnings: string[] = [];
    const none: Metrics = { problems, warnings, shape: '', target: 0, text: 0 };
    const root = document.querySelector<HTMLElement>('.read');
    const panel = root?.querySelector<HTMLElement>('.read-panel');
    if (!root || !panel) return { ...none, problems: ['the screen is not up'] };
    const box = panel.getBoundingClientRect();
    if (box.left < -0.5 || box.top < -0.5 || box.right > innerWidth + 0.5 || box.bottom > innerHeight + 0.5)
      problems.push('the screen is off the display');

    const shown = (node: Element): node is HTMLElement => {
      if (!(node instanceof HTMLElement) || node.hidden || node.getClientRects().length === 0) return false;
      const style = getComputedStyle(node);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
    };
    const name = (node: HTMLElement): string => {
      const own = [...node.classList].filter((c) => c !== 'read-tool' && c !== 'read-big' && c !== 'round');
      const where = node.dataset.at !== undefined ? `#${node.dataset.at}` : '';
      const text = node.matches('.read-piece, .read-samples li') ? `[${node.textContent}]` : '';
      return `${own.join('.') || node.className.split(' ')[0]}${where}${text}`;
    };
    const at = (node: HTMLElement): DOMRect => node.getBoundingClientRect();
    const all = (selector: string): HTMLElement[] => [...panel.querySelectorAll<HTMLElement>(selector)].filter(shown);
    const item = panel.querySelector<HTMLElement>('.read-item');
    const touching = item?.dataset.phase === 'touching';

    // Everything the player looks at or presses stays inside the screen, and does not touch its
    // rim.
    const scrolling = panel.querySelector<HTMLElement>('.read-chapters');
    const seen = all(
      '.read-close, .read-where, .read-bands, .read-caption, .read-earned, .read-hint, .read-piece, .read-tool, .read-answers, .read-check, .read-banner-line, .read-title, .read-welcome, .read-where-big, .read-stage-name, .read-samples li, .read-steps li, .read-stats, .read-promise, .read-treasure, .read-big, .read-hero, .read-done-title, .read-done-count, .read-done-fresh',
    ).filter((node) => !scrolling?.contains(node));
    for (const node of seen) {
      const r = at(node);
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1)
        problems.push(`${name(node)} is outside the screen`);
      else if (r.left < box.left + 6 || r.right > box.right - 6 || r.top < box.top + 6 || r.bottom > box.bottom - 6)
        warnings.push(`${name(node)} is close to the rim of the screen`);
    }

    // Nothing the player taps or reads is on top of anything else, and nothing is under the buttons
    // that are always in the corner.
    const corner = [...document.querySelectorAll<HTMLElement>('.hud button')].filter(shown);
    const parts = [
      ...all(
        '.read-close, .read-where, .read-bands, .read-caption, .read-hint, .read-piece, .read-tool, .read-check, .read-banner-line, .read-title, .read-welcome, .read-where-big, .read-stage-name, .read-samples li, .read-steps li, .read-stats, .read-promise, .read-treasure, .read-big, .read-pick, .read-done-title, .read-done-count, .read-done-fresh',
      ).filter((node) => !scrolling?.contains(node)),
      ...corner,
    ];
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const [a, b] = [parts[i]!, parts[j]!];
        if (a.contains(b) || b.contains(a) || (corner.includes(a) && corner.includes(b))) continue;
        const [p, q] = [at(a), at(b)];
        const across = Math.min(p.right, q.right) - Math.max(p.left, q.left);
        const down = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
        if (across > 2 && down > 2)
          problems.push(
            `${corner.includes(a) || corner.includes(b) ? 'the corner buttons are' : `${name(a)} and ${name(b)} are`} on top of each other by ${Math.round(across)}x${Math.round(down)}${corner.includes(a) || corner.includes(b) ? ` over ${name(corner.includes(a) ? b : a)}` : ''}`,
          );
      }
    }

    // What the player taps is big enough for a finger, and nothing is over it.
    let target = Infinity;
    const taps = all(`.read-close, .read-tool, .read-check, .read-big, .read-node${touching ? ', .read-piece' : ''}`);
    for (const node of taps) {
      const r = at(node);
      // A level that is part way out of a list that scrolls is reached by scrolling, so only the
      // ones whose middle is in view are looked at.
      if (
        scrolling?.contains(node) &&
        (r.top + r.height / 2 < at(scrolling).top || r.top + r.height / 2 > at(scrolling).bottom)
      )
        continue;
      const least = Math.min(r.width, r.height);
      target = Math.min(target, least);
      if (least < 32) problems.push(`${name(node)} is only ${Math.round(least)}px across to tap`);
      else if (least < 44) warnings.push(`${name(node)} is ${Math.round(least)}px across to tap`);
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && !node.contains(top) && !top.contains(node))
        problems.push(`${name(node)} is covered by ${top instanceof HTMLElement ? name(top) : top.tagName}`);
    }

    // What the player reads is big enough, and is not cut off.
    let text = Infinity;
    const size = (node: HTMLElement): number => Number.parseFloat(getComputedStyle(node).fontSize);
    const kind = item?.dataset.kind;
    for (const node of all(
      '.read-caption, .read-hint, .read-label, .read-banner-line, .read-title, .read-welcome, .read-level, .read-done-title, .read-done-count, .read-cap, .read-stats, .read-promise, .read-samples li, .read-step-text',
    )) {
      const px = size(node);
      text = Math.min(text, px);
      const least = node.matches('.read-cap')
        ? kind === 'line'
          ? 19
          : 30
        : node.matches('.read-hint, .read-stats, .read-promise')
          ? 13
          : node.matches('.read-label, .read-banner-line, .read-samples li, .read-step-text')
            ? 14
            : 16;
      if (px < least - 4) problems.push(`${name(node)} is written at ${px.toFixed(1)}px`);
      else if (px < least - 0.5) warnings.push(`${name(node)} is written at ${px.toFixed(1)}px`);
      if (
        node.scrollWidth > node.clientWidth + 1 &&
        getComputedStyle(node).display !== 'inline' &&
        !node.matches('.read-cap')
      )
        problems.push(`${name(node)} has its text cut off`);
    }
    const chapter = panel.querySelector<HTMLElement>('.read-chapter-name');
    if (chapter && shown(chapter) && chapter.scrollWidth > chapter.clientWidth + 1)
      warnings.push('the name of the chapter is shortened');

    // A word is on its stage, in as few rows as it can be, and a stage that holds it only at the
    // smallest size is said.
    const stage = panel.querySelector<HTMLElement>('.read-stage');
    const pieces = panel.querySelector<HTMLElement>('.read-pieces');
    if (stage && pieces) {
      const room = at(stage);
      for (const piece of all('.read-piece')) {
        const r = at(piece);
        if (r.left < room.left - 1 || r.right > room.right + 1 || r.top < room.top - 1 || r.bottom > room.bottom + 1)
          problems.push(`${name(piece)} is outside its stage`);
      }
      if (pieces.dataset.tight === 'true') warnings.push('the writing is as small as it goes');
    }

    // What is not meant to be scrolled is not, and what is, has the place the player is at in view.
    const roomy = innerHeight >= leastHeight;
    for (const pane of all('.read-item, .read-home, .read-done')) {
      if (pane.scrollHeight > pane.clientHeight + 1)
        (roomy ? problems : warnings).push(
          `${name(pane)} needs scrolling, by ${pane.scrollHeight - pane.clientHeight}px`,
        );
    }
    if (scrolling) {
      const here = scrolling.querySelector<HTMLElement>('.read-node[data-mark="current"]');
      const port = at(scrolling);
      if (!here) problems.push('the level she is on is not on the map');
      else {
        const r = at(here);
        if (r.top < port.top - 1 || r.bottom > port.bottom + 1) problems.push('the level she is on is out of view');
      }
    }

    const shape =
      item && pieces
        ? `${item.dataset.kind} ${item.dataset.phase} ${getComputedStyle(pieces).fontSize} in ${pieces.dataset.rows}`
        : (panel.querySelector('.read-body')?.firstElementChild?.className.split(' ')[0] ?? '');
    return {
      problems,
      warnings,
      shape,
      target: Number.isFinite(target) ? Math.round(target) : 0,
      text: Number.isFinite(text) ? Math.round(text * 10) / 10 : 0,
    };
  }, LEAST_HEIGHT);
}
