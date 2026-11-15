import { expect, type Page, test } from '@playwright/test';
import { WORD_IDS } from '../../src/content/lexicon';
import { hush, learningOn, openGame, type Pt, play, pressGear, watchConsole } from './helpers';
import { type Fingers, fingers } from './touch';

/**
 * A monkey. The report was that the main unicorn sometimes cannot be moved, that a tap anywhere
 * does nothing, and that turning the screen off and on frees her. Each way found for that has a
 * spec of its own, and a monkey is for the ways that nobody found: it does what a child, a parent
 * and a phone do (taps, drags, held fingers, keys, the parent's controls, the Spell Book, a card, a
 * playground game, the reading computer, the code pad, the screen going dark and coming back, the
 * phone turned over, a finger the system takes away, a way out) in an order that nobody planned,
 * and when it is done and everything is closed it asks the one thing that matters. Does a tap on
 * open ground send her there?
 *
 * What a step does is fixed by the seed and the step's number, and the page's timing cannot change
 * it. The one thing the page decides is whether something has the screen, which a child would see
 * too, and the step after it then closes it. So a failure is tried again with the same steps, and
 * says which seed it was and what it did. `UA_MONKEY_SEEDS=4,5` and `UA_MONKEY_ACTIONS=80` run
 * others, `UA_MONKEY_ALL=1` runs the projects other than the phone, and `UA_MONKEY_LOG=1` prints
 * what a run that passed did.
 */

const SEEDS = (process.env.UA_MONKEY_SEEDS ?? '1').split(',').map(Number);
/**
 * One project is enough for a run of the suite, and a run takes minutes. `UA_MONKEY_ALL=1` runs the
 * others.
 */
const ALL_PROJECTS = process.env.UA_MONKEY_ALL === '1';
const ACTIONS = Number(process.env.UA_MONKEY_ACTIONS ?? 36);
/**
 * A child cannot open a game, the pad or a card while something else has the screen, since their
 * taps do not reach them. `UA_MONKEY_LOOSE=1` opens them anyway, to see what the pieces do to each
 * other.
 */
const LOOSE = process.env.UA_MONKEY_LOOSE === '1';
/**
 * How many times slower than this machine the page is made to run, for the runs of fingers, so that
 * a slow tablet can be tried on a quick one.
 */
const THROTTLE = Number(process.env.UA_MONKEY_THROTTLE ?? 1);
/** How near the place she was sent a tap has to leave her, in world units. */
const NEAR = 48;
/**
 * How much of the world's own time she is given to get there. A stroll takes two or three seconds
 * of it. The page's clock is not the world's: on a machine that is busy the page draws a few frames
 * a second, and the world takes a few thousandths of a second at each.
 */
const SIM_PATIENCE = 8;
/**
 * How long the page is given, whatever the world says, before it is called too slow to judge by.
 */
const WALL_CAP_MS = 240_000;
/**
 * How long a finger that rests is let rest before a tap of another is believed (`REST_MS` in
 * `src/input/contacts.ts`), and a little over.
 */
const RESTING_FOR = 1100;
/**
 * Two things the engine says on its own, and nothing of the game's. It warns when the graphics
 * context goes and when it returns, which is what it is meant to do. And Phaser 4.2.1 calls
 * `preventDefault` on every `touchcancel` without asking whether it can be cancelled, which
 * Chromium never allows, so each time the system takes a finger away the browser says so. Nothing
 * is lost by it.
 */
const ENGINE_TALK = /WebGL Context (lost|restored)|Ignored attempt to cancel a touchcancel event/;

type Rng = () => number;

/** A small seeded generator, so that a run says which one it was and can be tried again. */
const generator = (seed: number): Rng => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
/**
 * A generator of its own for each step and each thing that a step decides, so that a step that took
 * another turn does not change what the next one does.
 */
const lane = (base: number, step: number, part: 'which' | 'how' | 'ask'): Rng =>
  generator(Math.imul(base * 4099 + step * 8 + ['which', 'how', 'ask'].indexOf(part) + 1, 0x9e3779b1));
const between = (rnd: Rng, low: number, high: number): number => low + rnd() * (high - low);
const shuffled = <T>(rnd: Rng, list: readonly T[]): T[] => {
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
};
const pick = <T>(rnd: Rng, list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;

const GAMES = [
  'sparkle-sky',
  'rainbow-ride',
  'cloud-bounce',
  'star-cannon',
  'balloon-song',
  'bubble-garden',
  'party-time',
  'morph-machine',
  'jewel-fountain',
  'lily-hop',
  'treasure-rain',
  'tone-matrix',
] as const;
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const;

/** The parts of the page that these runs reach into and the shared types leave out. */
interface Reach {
  panel: { isOpen: boolean };
  pad: { isOpen: boolean; open(door: string): void } | null;
  pointer?: { state(): unknown };
  /**
   * The reading computer: `seat` brings down the chunk it is made of and gives the session, which
   * `open` sits the player down at.
   */
  reading: { seat(): Promise<{ open(): string } | null> };
}
type Hooks = { __lose?: boolean; __armed?: boolean; __hide?: (hidden: boolean) => void };

/**
 * What has the screen from the game (the controls, a game, the pad, the book, a card or the reading
 * computer), in words. An empty string when nothing has.
 */
const coverOf = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const ua = window.__ua!;
    const reach = ua as unknown as Reach;
    const dialogs = [...document.querySelectorAll('.spell-card, [role="dialog"]')].map(
      (e) => e.getAttribute('aria-label') ?? String(e.className),
    );
    return [
      reach.panel.isOpen && 'the parent controls',
      !!reach.pad?.isOpen && 'the pad',
      ua.wonders.isOpen && 'a game',
      ua.spellBook.isOpen && 'the book',
      ua.lessons.busy && 'a lesson',
      !!ua.reading.reader?.busy && 'the reading computer',
      ...dialogs,
    ]
      .filter(Boolean)
      .join(', ');
  });

const covered = async (page: Page): Promise<boolean> => (await coverOf(page)) !== '';

const phaseOf = (page: Page): Promise<string> => page.evaluate(() => window.__ua!.controller.phase);

/**
 * Whether a child could open something now: the game is being played and nothing has the screen.
 */
const mayOpen = async (page: Page): Promise<boolean> =>
  LOOSE || ((await phaseOf(page)) === 'playing' && !(await covered(page)));

const leaderAt = (page: Page): Promise<Pt> =>
  page.evaluate(() => {
    const u = window.__ua!.controller.world.unicorns.wildstar!;
    return { x: u.pos.x, y: u.pos.y };
  });

/**
 * A place in the world a stroll from her, and where it is on the screen, that is open ground in
 * sight with nothing of the page over it. Null when there is none now.
 */
function openPlace(page: Page, start: number): Promise<{ world: Pt; screen: Pt } | null> {
  return page.evaluate((first) => {
    const { controller } = window.__ua!;
    const { world } = controller;
    const me = world.unicorns.wildstar!.pos;
    for (const reach of [150, 110, 80]) {
      for (let i = 0; i < 12; i++) {
        const angle = first + (i * Math.PI * 2) / 12;
        const to = { x: me.x + Math.cos(angle) * reach, y: me.y + Math.sin(angle) * reach };
        const screen = controller.toScreen(to);
        if (screen.x < 24 || screen.y < 24 || screen.x > innerWidth - 24 || screen.y > innerHeight - 24) continue;
        if (!world.nav.isWalkable(to, 12) || controller.thingAt(to)) continue;
        // The way there is open ground the whole way, so that a tap says something about her and
        // not about a hedge.
        let clear = true;
        for (let k = 1; k < 10 && clear; k++)
          clear = world.nav.isWalkable({ x: me.x + ((to.x - me.x) * k) / 10, y: me.y + ((to.y - me.y) * k) / 10 }, 8);
        if (!clear) continue;
        const over = document.elementFromPoint(screen.x, screen.y);
        if (over?.tagName !== 'CANVAS') continue;
        return { world: to, screen };
      }
    }
    return null;
  }, start);
}

interface Answer {
  went: boolean;
  why: string;
  /**
   * The question could not be asked, because something opened over the game on its own while the
   * place was looked for. Not an answer either way.
   */
  skipped?: true;
}

/**
 * How the page is doing, for a failure that says only that the world did not go on. In one second
 * it counts the frames the page was given (`drawn`), how many of them the game's loop took
 * (`taken`), and the rate the engine puts on itself (`fps`). A page that was given none was starved
 * by the machine, and a page that was given many while the game took none has lost its loop.
 */
const pulse = (page: Page): Promise<{ drawn: number; taken: number; fps: number; hidden: boolean }> =>
  page.evaluate(
    () =>
      new Promise((done) => {
        const loop = window.__ua!.stage.game.loop;
        const [first, since] = [loop.frame, performance.now()];
        let drawn = 0;
        const tick = (): void => {
          drawn += 1;
          if (performance.now() - since >= 1000)
            done({ drawn, taken: loop.frame - first, fps: Math.round(loop.actualFps), hidden: document.hidden });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );

/**
 * Taps open ground a stroll from her, and says whether she went there. The fingers that are given
 * make the tap, and the mouse is used otherwise. A tap on a tree or a friend sends her there and
 * the card opens when she arrives, which can be after the next thing a child did, so something that
 * opens over the game while a place is looked for is no answer, unless the screen was cleared on
 * purpose and `strict` is on.
 */
async function tryOnce(page: Page, rnd: Rng, hand: Fingers | null, patience: number, strict: boolean): Promise<Answer> {
  await hush(page);
  let place: { world: Pt; screen: Pt } | null = null;
  for (let tries = 0; tries < 40 && !place; tries++) {
    const cover = await coverOf(page);
    if (cover && !strict)
      return {
        went: true,
        why: `something opened over the game while a place was looked for (${cover})`,
        skipped: true,
      };
    if (!cover && (await phaseOf(page)) === 'playing') place = await openPlace(page, rnd() * Math.PI * 2);
    if (!place) await page.waitForTimeout(400);
  }
  if (!place) {
    // Nothing of the page should be over the game when everything is closed, so what is over it is
    // worth saying, and so is what the game's own picture is doing.
    const over = await page.evaluate(() =>
      document
        .elementsFromPoint(innerWidth / 2, innerHeight / 2)
        .slice(0, 4)
        .map((e) => `${e.tagName.toLowerCase()}${e.className ? `.${String(e.className).split(' ').join('.')}` : ''}`),
    );
    const picture = await page.evaluate(() => {
      const canvas = window.__ua!.stage.game.canvas;
      const [box, style] = [canvas.getBoundingClientRect(), getComputedStyle(canvas)];
      return {
        phase: window.__ua!.controller.phase,
        joined: canvas.isConnected,
        box: [box.x, box.y, box.width, box.height].map(Math.round),
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        page: [innerWidth, innerHeight],
        fullScreen: !!document.fullscreenElement,
      };
    });
    return {
      went: false,
      why: `there was no open ground in sight to tap, the screen is held by "${await coverOf(page)}" and over the middle of it are ${over.join(', ')}, with ${JSON.stringify({ ...picture, ...(await pulse(page)) })}`,
    };
  }
  const from = await leaderAt(page);
  if (hand) await hand.tap(7, place.screen, 60);
  else await page.mouse.click(place.screen.x, place.screen.y);
  const simAt = (): Promise<number> => page.evaluate(() => window.__ua!.controller.world.time);
  const [sim0, wall0] = [await simAt(), Date.now()];
  let nearest = Infinity;
  let simSpent = 0;
  // She has had her time when the world has gone on for `SIM_PATIENCE` seconds. A world that has
  // not gone on at all for as long as the page was given is a different failure, and is said so.
  for (;;) {
    const at = await leaderAt(page);
    nearest = Math.min(nearest, Math.hypot(at.x - place.world.x, at.y - place.world.y));
    if (nearest < NEAR) return { went: true, why: '' };
    // A card or a game that opens over the game while she walks puts the world to rest by design,
    // and a world at rest cannot be judged. A finger that landed on a friend a moment ago opens one
    // when it lifts.
    const cover = strict ? null : await coverOf(page);
    if (cover) return { went: true, why: `something opened over the game while she walked (${cover})`, skipped: true };
    simSpent = (await simAt()) - sim0;
    const wallSpent = Date.now() - wall0;
    if (simSpent >= SIM_PATIENCE || wallSpent >= WALL_CAP_MS || (wallSpent >= patience * 2 && simSpent < 0.5)) break;
    await page.waitForTimeout(250);
  }
  const state = await page.evaluate(() => {
    const ua = window.__ua!;
    const { world, phase } = ua.controller;
    return {
      phase,
      paused: world.paused,
      leader: world.leader.phase,
      steering: world.leader.steer !== null,
      listening: ua.stage.scene.input.enabled,
      running: ua.stage.game.loop.running,
      press: (ua as unknown as Reach).pointer?.state(),
    };
  });
  return {
    went: false,
    why: `she was sent from (${Math.round(from.x)}, ${Math.round(from.y)}) to (${Math.round(place.world.x)}, ${Math.round(place.world.y)}) and came no nearer than ${Math.round(nearest)} in ${Math.round((Date.now() - wall0) / 1000)} s of the page and ${simSpent.toFixed(1)} s of the world, with ${JSON.stringify({ ...state, ...(await pulse(page)) })}`,
  };
}

/**
 * Asks the one thing that matters. A finger that was lost a moment ago is allowed to hold up the
 * first tap (a tap beside a finger that has just landed is the second finger of a hand, and is not
 * believed until the first has rested), so a tap that does not work is tried again once that time
 * has passed, and the second is the answer.
 */
async function probe(page: Page, rnd: Rng, hand: Fingers | null, patience: number, strict = false): Promise<Answer> {
  const first = await tryOnce(page, rnd, hand, Math.min(patience, 8000), strict);
  if (first.went) return first;
  await page.waitForTimeout(RESTING_FOR);
  return tryOnce(page, rnd, hand, patience, strict);
}

/**
 * Gives the page another shape. The game goes full screen on a tap of its button or on a key (a
 * child can do either), and a window that is full screen cannot be resized until it is brought
 * back, so it is, as a person would with the button.
 */
async function reshape(page: Page, size: { width: number; height: number }): Promise<void> {
  if (await page.evaluate(() => !!document.fullscreenElement)) {
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement);
  }
  await page.setViewportSize(size);
}

/**
 * Closes whatever is open, the way a person does: the key that every one of them answers, then its
 * own button.
 */
async function closeEverything(page: Page): Promise<void> {
  for (let round = 0; round < 14 && ((await covered(page)) || (await phaseOf(page)) !== 'playing'); round++) {
    await page.keyboard.press('Escape');
    for (const selector of ['.wonder-done', '.spell-shut', '.book-shut', '.close']) {
      const button = page.locator(selector).first();
      if (await button.isVisible().catch(() => false)) await button.click({ timeout: 1500 }).catch(() => undefined);
    }
    await page.waitForTimeout(450);
  }
}

interface Kit {
  page: Page;
  rnd: Rng;
  /** Fingers when the run is made of them. Null for a run of the mouse. */
  hand: Fingers | null;
  size: { width: number; height: number };
  note(text: string): void;
}

/**
 * An action that leaves something the system or the page could have got wrong asks the one thing
 * that matters straight away, when nothing has the screen. One that is for fingers is left out of
 * the runs of the mouse.
 */
type Action = { name: string; weight: number; probe?: boolean; fingers?: true; run(kit: Kit): Promise<void> };

const anywhere = (kit: Kit): Pt => ({
  x: between(kit.rnd, 30, kit.size.width - 30),
  y: between(kit.rnd, 30, kit.size.height - 30),
});

/**
 * A place that the game itself would hear, with no button of the page over it, from a handful that
 * are drawn anywhere. Only the game keeps a press, so this is where a press that is lost has to
 * land to mean anything.
 */
async function onTheGame(kit: Kit): Promise<Pt> {
  const places = Array.from({ length: 24 }, () => anywhere(kit));
  const hit = await kit.page.evaluate(
    (list) => list.find((p) => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') ?? null,
    places,
  );
  return hit ?? places[0]!;
}

/**
 * One finger or the mouse, put down, taken along a short way and lifted, for as long as the action
 * says.
 */
async function press(kit: Kit, holdFor: number, travel: boolean): Promise<void> {
  const { page, hand } = kit;
  const start = anywhere(kit);
  const end = anywhere(kit);
  const way = (k: number): Pt => ({
    x: start.x + ((end.x - start.x) * k) / 4,
    y: start.y + ((end.y - start.y) * k) / 4,
  });
  kit.note(
    `${hand ? 'finger' : 'mouse'} at ${Math.round(start.x)},${Math.round(start.y)} for ${Math.round(holdFor)} ms${travel ? `, taken to ${Math.round(end.x)},${Math.round(end.y)}` : ''}`,
  );
  if (hand) {
    await hand.down(1, start);
    for (let k = 1; k <= 4 && travel; k++) {
      await page.waitForTimeout(holdFor / 5);
      await hand.move(1, way(k));
    }
    await page.waitForTimeout(holdFor / 5);
    await hand.up(1);
    return;
  }
  try {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let k = 1; k <= 4 && travel; k++) {
      await page.waitForTimeout(holdFor / 5);
      const to = way(k);
      await page.mouse.move(to.x, to.y, { steps: 2 });
    }
    await page.waitForTimeout(holdFor / 5);
  } finally {
    await page.mouse.up();
  }
}

const ACTIONS_OF: Action[] = [
  {
    name: 'tap',
    weight: 6,
    async run(kit) {
      const at = anywhere(kit);
      kit.note(`tap ${Math.round(at.x)},${Math.round(at.y)}`);
      if (kit.hand) await kit.hand.tap(2, at, 60);
      else await kit.page.mouse.click(at.x, at.y);
    },
  },
  { name: 'drag', weight: 3, run: (kit) => press(kit, between(kit.rnd, 400, 1200), true) },
  { name: 'hold', weight: 2, run: (kit) => press(kit, between(kit.rnd, 300, 1600), false) },
  {
    name: 'keys',
    probe: true,
    weight: 2,
    async run(kit) {
      const { page, rnd } = kit;
      const keys = [pick(rnd, KEYS), ...(rnd() < 0.4 ? [pick(rnd, KEYS)] : [])];
      const chord = rnd() < 0.25;
      kit.note(`keys ${keys.join('+')}${chord ? ' with Command let go before the arrow' : ''}`);
      if (chord) await page.keyboard.down('Meta');
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(between(rnd, 150, 800));
      // A key let go under Command is one the system never says was lifted.
      if (chord) await page.keyboard.up('Meta');
      for (const key of keys) await page.keyboard.up(key);
    },
  },
  {
    name: 'open the parent controls',
    weight: 2,
    async run(kit) {
      const { page } = kit;
      if (await page.getByRole('dialog', { name: 'Parent controls' }).isVisible()) return;
      kit.note('parent controls held open');
      await pressGear(page);
      await page
        .getByRole('dialog', { name: 'Parent controls' })
        .waitFor({ timeout: 4000 })
        .catch(() => undefined);
      await page.mouse.up();
    },
  },
  {
    name: 'close with the key',
    weight: 3,
    async run(kit) {
      kit.note('Escape');
      await kit.page.keyboard.press('Escape');
    },
  },
  {
    name: 'open the Spell Book',
    weight: 2,
    async run(kit) {
      const chip = kit.page.getByRole('button', { name: /^Open my Spell Book/ });
      if (!(await chip.isVisible())) return;
      kit.note('Spell Book chip');
      await chip.click({ timeout: 2000 });
    },
  },
  {
    name: 'open a game',
    weight: 3,
    async run(kit) {
      if (!(await mayOpen(kit.page))) return;
      const game = pick(kit.rnd, GAMES);
      kit.note(`game ${game}`);
      await kit.page.evaluate(
        (id) => window.__ua!.wonders.open({ game: id, at: { x: innerWidth / 2, y: innerHeight * 0.4 } }),
        game,
      );
    },
  },
  {
    // The player is sat down at the computer without the walk to it, which a spec of its own
    // covers, so that every other thing in this list is done to the screen too: a tap, a drag, a
    // key, the screen going dark, the phone turned, a finger the system takes away, the parent's
    // controls over it.
    name: 'sit down at the reading computer',
    weight: 3,
    async run(kit) {
      if (!(await mayOpen(kit.page))) return;
      kit.note('sat down at the reading computer');
      await kit.page.evaluate(async () => (await (window.__ua as unknown as Reach).reading.seat())?.open());
    },
  },
  {
    name: 'open a card',
    weight: 2,
    async run(kit) {
      // From the book a card is a word the player picked in it, which goes up over the book.
      // Otherwise it is what a touched fruit or a friend would ask.
      const book = kit.page.locator('[data-content-id="learning.book.word"]').first();
      if (await book.isVisible()) {
        kit.note('a word picked in the book');
        await book.click({ timeout: 2000 });
        return;
      }
      if (!(await mayOpen(kit.page))) return;
      const word = pick(kit.rnd, WORD_IDS);
      kit.note(`card for ${word}`);
      await kit.page.evaluate((w) => window.__ua!.lessons.practice(w), word);
    },
  },
  {
    name: 'ask the book where a word is',
    weight: 2,
    async run(kit) {
      // The book is opened if it is shut, and a word the player has not found is asked for, which
      // closes it and sets Wildstar off. Then the bubble that follows her is tapped or put away.
      // Escape comes up far more often than the chip does, so an action that waited for the book to
      // be open by chance would hardly ever run.
      const { page } = kit;
      const find = page.locator('[data-content-id="learning.book.find"]').first();
      const bubble = page.locator('[data-content-id="learning.seek.go"]');
      const stop = page.locator('[data-content-id="learning.seek.stop"]');
      if (!(await find.isVisible())) {
        if (!(await mayOpen(page))) return;
        if (!(await bubble.isVisible())) {
          const chip = page.getByRole('button', { name: /^Open my Spell Book/ });
          if (!(await chip.isVisible())) return;
          kit.note('opened the book to ask for a word');
          await chip.click({ timeout: 2000 });
        }
      }
      if (await find.isVisible()) {
        kit.note('asked to be shown a word');
        await find.click({ timeout: 2000 });
        return;
      }
      if (!(await bubble.isVisible())) return;
      if (kit.rnd() < 0.3 && (await stop.isVisible())) {
        kit.note('put the search for a word away');
        await stop.click({ timeout: 2000 });
        return;
      }
      kit.note('tapped the bubble for a word');
      await bubble.click({ timeout: 2000 });
    },
  },
  {
    name: 'open the code pad',
    weight: 1,
    async run(kit) {
      if (!(await mayOpen(kit.page))) return;
      kit.note('code pad');
      await kit.page.evaluate(() => (window.__ua as unknown as Reach).pad?.open('monkey-door'));
    },
  },
  {
    name: 'type on the pad',
    weight: 1,
    async run(kit) {
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      const typed = Array.from(
        { length: 1 + Math.floor(kit.rnd() * 3) },
        () => letters[Math.floor(kit.rnd() * 26)]!,
      ).join('');
      kit.note(`typing ${typed}`);
      await kit.page.keyboard.type(typed, { delay: 40 });
    },
  },
  {
    name: 'the screen goes dark and comes back',
    probe: true,
    weight: 3,
    async run(kit) {
      const { page, rnd } = kit;
      const dark = between(rnd, 80, 1200);
      kit.note(`screen off for ${Math.round(dark)} ms`);
      await page.evaluate(() => {
        const w = window as unknown as Hooks;
        w.__hide = (hidden: boolean) => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => (hidden ? 'hidden' : 'visible'),
          });
          document.dispatchEvent(new Event('visibilitychange'));
        };
        w.__hide(true);
      });
      await page.waitForTimeout(dark);
      await page.evaluate(() => (window as unknown as Hooks).__hide?.(false));
    },
  },
  {
    name: 'the window loses and gets back the focus',
    probe: true,
    weight: 1,
    async run(kit) {
      kit.note('blur and focus');
      await kit.page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        setTimeout(() => window.dispatchEvent(new Event('focus')), 200);
      });
    },
  },
  {
    name: 'the graphics context is lost and comes back',
    probe: true,
    weight: 1,
    async run(kit) {
      const { page } = kit;
      const lost = between(kit.rnd, 200, 1800);
      // A lost context hands out no extensions, so the lever that restores it is taken before.
      const began = await page.evaluate(() => {
        const gl = window.__ua!.stage.game.renderer.gl;
        const lever = gl.getExtension('WEBGL_lose_context');
        if (!lever || gl.isContextLost()) return false;
        (window as unknown as { __lever?: WEBGL_lose_context }).__lever = lever;
        lever.loseContext();
        return true;
      });
      if (!began) return;
      kit.note(`graphics context lost for ${Math.round(lost)} ms`);
      await page.waitForTimeout(lost);
      await page.evaluate(() => (window as unknown as { __lever?: WEBGL_lose_context }).__lever?.restoreContext());
      await page.waitForFunction(
        () => !window.__ua!.stage.game.renderer.gl.isContextLost() && !window.__ua!.stage.game.renderer.contextLost,
        undefined,
        { timeout: 30_000 },
      );
    },
  },
  {
    name: 'the phone is turned',
    probe: true,
    weight: 2,
    async run(kit) {
      const now = kit.page.viewportSize()!;
      kit.note(`turned to ${now.height}x${now.width}`);
      await reshape(kit.page, { width: now.height, height: now.width });
      kit.size = { width: now.height, height: now.width };
      await kit.page.waitForTimeout(250);
    },
  },
  {
    name: 'a way out',
    weight: 1,
    async run(kit) {
      const { page } = kit;
      if ((await covered(page)) || (await phaseOf(page)) !== 'playing') return;
      const id = await page.evaluate(() => {
        const { controller } = window.__ua!;
        const gateway = controller.world.map.portals.find((p) => !p.door);
        if (!gateway) return null;
        controller.debugTeleport(gateway.approach);
        return gateway.portalId;
      });
      if (!id) return;
      kit.note(`way out ${id}`);
      await page.waitForTimeout(500);
      await page.evaluate((portal) => window.__ua!.controller.goToExit(portal), id);
    },
  },
  {
    name: 'the system takes a press away',
    probe: true,
    weight: 2,
    async run(kit) {
      const { page, hand } = kit;
      // Only the game hears a press that lands on it, so the screen is cleared first, as a child's
      // is when they have put a game away.
      await closeEverything(page);
      kit.note(`${hand ? 'a finger' : 'the mouse button'} whose lift is never heard`);
      await page.evaluate(() => {
        const w = window as unknown as Hooks;
        if (w.__armed) return;
        w.__armed = true;
        for (const type of ['touchend', 'touchcancel', 'pointerup', 'pointercancel', 'lostpointercapture', 'mouseup'])
          window.addEventListener(type, (e) => w.__lose && e.stopImmediatePropagation(), { capture: true });
      });
      const lose = (on: boolean): Promise<boolean> =>
        page.evaluate((v) => ((window as unknown as Hooks).__lose = v), on);
      const at = await onTheGame(kit);
      if (hand) {
        await hand.down(5, at);
        await page.waitForTimeout(between(kit.rnd, 100, 700));
        await lose(true);
        await hand.up(5);
        await lose(false);
        return;
      }
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.waitForTimeout(between(kit.rnd, 100, 700));
      await lose(true);
      await page.mouse.up();
      await lose(false);
    },
  },
  {
    name: 'a whole hand lands',
    fingers: true,
    probe: true,
    weight: 2,
    async run(kit) {
      const { page, hand } = kit;
      if (!hand) return;
      const ids = Array.from({ length: 3 + Math.floor(kit.rnd() * 3) }, (_, i) => 11 + i);
      const near = anywhere(kit);
      kit.note(`${ids.length} fingers land together near ${Math.round(near.x)},${Math.round(near.y)}`);
      for (const [i, id] of ids.entries()) {
        await hand.down(id, {
          x: Math.min(Math.max(near.x + i * 26, 4), kit.size.width - 4),
          y: Math.min(Math.max(near.y + (i % 2) * 22, 4), kit.size.height - 4),
        });
      }
      await page.waitForTimeout(between(kit.rnd, 100, 900));
      for (const id of shuffled(kit.rnd, ids)) {
        await hand.up(id);
        await page.waitForTimeout(between(kit.rnd, 10, 120));
      }
    },
  },
  {
    name: 'the system cancels the touches',
    fingers: true,
    probe: true,
    weight: 2,
    async run(kit) {
      const { page, hand } = kit;
      if (!hand) return;
      kit.note('a swipe from the edge cancels every finger');
      await hand.down(3, anywhere(kit));
      await page.waitForTimeout(between(kit.rnd, 50, 500));
      await hand.cancel();
    },
  },
  {
    name: 'a flurry of taps',
    weight: 2,
    async run(kit) {
      const { page, hand } = kit;
      const taps = 6 + Math.floor(kit.rnd() * 8);
      kit.note(`${taps} quick taps`);
      for (let i = 0; i < taps; i++) {
        const at = anywhere(kit);
        if (hand) await hand.tap(4, at, 40);
        else await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(between(kit.rnd, 20, 140));
      }
    },
  },
  {
    name: 'a finger comes to rest and stays',
    fingers: true,
    weight: 2,
    async run(kit) {
      if (!kit.hand || kit.hand.held().includes(9)) return;
      const at = anywhere(kit);
      kit.note(`a finger rests at ${Math.round(at.x)},${Math.round(at.y)}`);
      await kit.hand.down(9, at);
    },
  },
  {
    name: 'the resting finger lifts',
    fingers: true,
    weight: 2,
    async run(kit) {
      if (!kit.hand?.held().includes(9)) return;
      kit.note('the resting finger lifts');
      await kit.hand.up(9);
    },
  },
  {
    name: 'a quiet moment',
    weight: 2,
    async run(kit) {
      const ms = between(kit.rnd, 400, 2200);
      kit.note(`quiet for ${Math.round(ms)} ms`);
      await kit.page.waitForTimeout(ms);
    },
  },
];

const named = (name: string): Action => ACTIONS_OF.find((a) => a.name === name)!;

/** A pick from a pool of actions, by weight. */
const choose = (pool: readonly Action[], rnd: Rng): Action => {
  let at = rnd() * pool.reduce((sum, a) => sum + a.weight, 0);
  for (const action of pool) {
    at -= action.weight;
    if (at < 0) return action;
  }
  return pool[0]!;
};

/**
 * From the fifth step on, every this many steps, a press is taken away, so that every run comes to
 * the state that it is for and does not leave that to the draw.
 */
const TAKING_EVERY = 12;
/**
 * In each stretch of that many steps, at the ninth, the player is sat down at the reading computer
 * when nothing has the screen, for the same reason: a run that left it to the draw would not always
 * meet it, and the default run is one seed.
 */
const SITTING_AT = 8;

test.describe('a monkey at the game', () => {
  test.setTimeout(900_000);

  for (const mode of ['mouse', 'fingers'] as const) {
    for (const seed of SEEDS) {
      test(`${mode}, seed ${seed}: once everything is closed, a tap on open ground still sends her there`, async ({
        page,
        browserName,
        hasTouch,
      }, info) => {
        test.skip(
          !ALL_PROJECTS && info.project.name !== 'phone',
          'the phone project is the one that runs by default, and UA_MONKEY_ALL=1 runs the rest',
        );
        test.skip(
          mode === 'fingers' && (browserName !== 'chromium' || !hasTouch),
          'real fingers are driven through Chromium',
        );
        const noise = watchConsole(page);
        await openGame(page);
        await play(page);
        await learningOn(page);
        const base = seed * 1009 + (mode === 'fingers' ? 7 : 0);
        const hand = mode === 'fingers' ? await fingers(page) : null;
        // A tap of the fingers is sent without waiting for the page, so a slow page cannot make it
        // longer than a finger did. A click of the mouse waits, and would be made longer by it.
        if (hand && THROTTLE > 1)
          await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
        const pool = ACTIONS_OF.filter((a) => hand || !a.fingers);
        const log: string[] = [];
        /**
         * How many times each was chosen, and how many of those did something and did not find the
         * page unready for it.
         */
        const tally: Record<string, number> = {};
        const done: Record<string, number> = {};
        let current = '';
        const started = Date.now();
        const kit: Kit = {
          page,
          rnd: lane(base, 0, 'how'),
          hand,
          size: page.viewportSize()!,
          note: (text) => {
            done[current] = (done[current] ?? 0) + 1;
            log.push(`${String(Math.round((Date.now() - started) / 100) / 10).padStart(6)} s  ${text}`);
          },
        };
        const said = (): string => {
          const spoken = noise.filter((line) => !ENGINE_TALK.test(line)).slice(-6);
          // The last forty lines say what led to a failure. With `UA_MONKEY_LOG=1` it is all of
          // them, for a failure that began long before the end.
          return `${mode} seed ${seed}\n${(process.env.UA_MONKEY_LOG === '1' ? log : log.slice(-40)).join('\n')}${spoken.length > 0 ? `\nwhat the page said so far\n${spoken.join('\n')}` : ''}`;
        };

        for (let n = 0; n < ACTIONS; n++) {
          const [which, ask] = [lane(base, n, 'which'), lane(base, n, 'ask')];
          kit.rnd = lane(base, n, 'how');
          // A child who has a game or the book open puts it away before long. Both draws are made
          // whatever the page shows, so that what the page shows cannot change what the steps after
          // this one do.
          const [putAway, drawn] = [which(), choose(pool, which)];
          const held = await coverOf(page);
          const shut = held !== '' || (await phaseOf(page)) !== 'playing';
          const action =
            n % TAKING_EVERY === 5
              ? named('the system takes a press away')
              : n % TAKING_EVERY === SITTING_AT && !shut
                ? named('sit down at the reading computer')
                : shut && putAway < 0.5
                  ? named('close with the key')
                  : drawn;
          current = action.name;
          tally[action.name] = (tally[action.name] ?? 0) + 1;
          const caught = (): Promise<number> => page.evaluate(() => window.__ua!.faults.repaired.touch);
          const caughtBefore = await caught();
          try {
            await action.run(kit);
          } catch (error) {
            // An action that could not be made because the page had moved on (a button that was
            // gone by the time it was reached) says nothing about the game.
            if (/closed|crash/i.test(String(error))) throw error;
            log.push(`          (${action.name} was not possible: ${String(error).split('\n')[0]})`);
          }
          await page.waitForTimeout(between(which, 40, 500));
          const now = await coverOf(page);
          if (now !== held) log.push(`          the screen is held by: ${now || 'nothing'}`);
          expect(
            await page.evaluate(() => window.__ua!.invariants()),
            `what the world broke after ${action.name}\n${said()}`,
          ).toEqual([]);
          // Now and then, and straight after what could have left something wrong, when nothing has
          // the screen, the one thing that matters is asked.
          if ((action.probe || n % 9 === 8) && now === '' && (await phaseOf(page)) === 'playing') {
            const answer = await probe(page, ask, hand, 20_000);
            log.push(
              `          probe after ${action.name}: ${answer.skipped || answer.went ? answer.why || 'she went' : answer.why}`,
            );
            expect(answer.went, `after ${action.name}, ${answer.why}\n${said()}`).toBe(true);
          }
          if ((await caught()) > caughtBefore) log.push('          the game found a press whose lift it never heard');
        }
        // Any finger still on the glass lifts.
        for (const id of hand?.held() ?? []) await hand!.up(id);

        // Everything is let go, the phone is held as it was, and the page is shown.
        await page.evaluate(() => (window as unknown as Hooks).__hide?.(false));
        await reshape(page, info.project.use.viewport ?? { width: 863, height: 360 });
        kit.size = page.viewportSize()!;
        await page.mouse.up();

        // Whatever is open is closed and the one thing that matters is asked. A card that a tap on
        // a tree sent her to can open late, after everything was closed, so it is closed again. A
        // tap on open ground ends that errand, so the only card that can open after it is one of a
        // friend who drifted under that tap, and that opens as she arrives.
        let answer: Answer = { went: false, why: 'never asked', skipped: true };
        for (let round = 0; round < 4 && answer.skipped; round++) {
          await closeEverything(page);
          await page.waitForTimeout(1500);
          answer = await probe(page, lane(base, ACTIONS + round, 'ask'), hand, 25_000);
          // A friend that drifted under the tap opens her card at the moment Wildstar arrives,
          // which is the moment she is said to have gone, so it is given a moment to open.
          if (!answer.skipped) {
            await page.waitForTimeout(700);
            if (await covered(page)) answer = { went: true, why: 'a card opened as she arrived', skipped: true };
          }
          if (answer.skipped) log.push(`          a card opened late and was closed again: ${answer.why}`);
        }
        expect(answer.skipped, `something kept opening over the game\n${said()}`).toBeUndefined();
        expect(answer.went, `${answer.why}\n${said()}`).toBe(true);
        await page.waitForTimeout(500);

        const rest = await page.evaluate(() => {
          const ua = window.__ua!;
          return {
            phase: ua.controller.phase,
            running: ua.stage.game.loop.running,
            listening: ua.stage.scene.input.enabled,
            faults: Object.fromEntries(ua.faults.counts),
            repaired: { ...ua.faults.repaired },
            leftover: [...document.querySelectorAll('.wonder, .spell-card, [role="dialog"], .ride')].map(
              (n) => n.className || n.getAttribute('role'),
            ),
            flag: document.getElementById('ui')?.dataset.wonder ?? null,
          };
        });
        expect(rest.leftover, `what is left on the page\n${said()}`).toEqual([]);
        expect(rest, `the state of the game\n${said()}`).toMatchObject({
          phase: 'playing',
          running: true,
          listening: true,
          flag: null,
        });
        expect(rest.faults, `what the game carried on past\n${said()}`).toEqual({});
        expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
        expect(
          noise.filter((line) => !ENGINE_TALK.test(line)),
          `what the page said\n${said()}`,
        ).toEqual([]);
        // A press whose lift was never heard is found again by the next press, and the game says
        // so. A run in which none was found never came to the state it is for, and a green that
        // says nothing is worse than none.
        if (ACTIONS > 5)
          expect(
            rest.repaired.touch,
            `no press whose lift was lost was found again, so the run did not come to the state it is for\ndid ${JSON.stringify(done)}\n${said()}`,
          ).toBeGreaterThan(0);
        info.annotations.push(
          { type: 'actions', description: `${log.length} lines` },
          { type: 'put right', description: JSON.stringify(rest.repaired) },
        );
        console.log(
          `${mode} seed ${seed}: ${log.length} lines, put right by the game ${JSON.stringify(rest.repaired)}\n  chosen ${JSON.stringify(tally)}\n  done ${JSON.stringify(done)}`,
        );
        if (process.env.UA_MONKEY_LOG === '1') console.log(log.join('\n'));
      });
    }
  }
});
