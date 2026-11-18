import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import type { MathsView } from '../../src/game/maths-ports';
import type { PlayRecord } from '../../src/shared/play';
import { silence } from '../../tools/qa/silence';

export interface Pt {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How well one skill is known for one word, as the book keeps it. */
interface Progress {
  level: number;
  best: number;
  streak: number;
  struggles: number;
  done: number;
  clean: number;
  slips: number;
  due: number;
}

interface Ua {
  controller: {
    phase: string;
    world: {
      time: number;
      paused: boolean;
      /** Who follows her, nearest first. */
      order: string[];
      /** Doors opened by a word or a clue, for as long as the game is open. */
      unlocked: Set<string>;
      /**
       * Friends who have been reached and wait to be asked in. Only the `ask` rule puts anyone
       * here.
       */
      met: Set<string>;
      persistent: {
        recruited: string[];
        visitedMaps: string[];
        props: Record<string, { kind: string; open?: boolean; state?: string }>;
      };
      map: {
        id: string;
        encounters: { unicornId: string; home: Pt; greeting: Pt }[];
        interactables: { instanceId: string; pos: Pt }[];
        spawns: { spawnId: string; points: Pt[] }[];
        portals: {
          portalId: string;
          bounds: Rect;
          approach: Pt;
          door?: string;
          to: { mapId: string; spawnId: string };
        }[];
      };
      interactables: Map<
        string,
        { instanceId: string; definitionId: string; pos: Pt; hit: Rect; approach: { pos: Pt }[] }
      >;
      nav: {
        freePointNear(center: Pt, avoid: Pt[], gap?: number, maxRadius?: number): Pt | null;
        isWalkable(p: Pt, margin?: number): boolean;
        canSetOff(p: Pt): boolean;
      };
      unicorns: Record<
        string,
        {
          pos: Pt;
          prev: Pt;
          speed: number;
          facing: number;
          anim: { clip: string; facing: number };
          state: { kind: string; activity?: string };
        }
      >;
      leader: {
        phase: 'idle' | 'pathing' | 'walking' | 'steering';
        goal: Pt | null;
        steer: { want: Pt | null; pace: number } | null;
        seat: string | null;
      };
      /** Whether she has the crown from the palace on her head. */
      crown: { worn: boolean };
      npcs: { instanceId: string; pos: Pt }[];
      pickups: { list: { id: string; produce: string; to: Pt }[]; made: number };
      life: {
        critters: {
          id: string;
          kind: string;
          look: string;
          pos: Pt;
          z: number;
          anim: { clip: string; facing: string };
          state: { kind: string; busy?: boolean };
        }[];
      };
      /** When each live effect ends, in game time. */
      effects: number[];
      /** What each prop is doing for a while after a tap, by instance. */
      transient: Map<string, { kind: string; since: number; until: number }>;
      events: unknown[];
    };
    toScreen(p: Pt): Pt;
    toWorld(css: Pt): Pt;
    /** How far the camera has stood back to see the whole of a place: 0 at home, 1 on all of it. */
    surveyed: number;
    thingAt(world: Pt): boolean;
    /** What a tap at a world point would land on. */
    targetAt(world: Pt): { kind: 'unicorn' | 'critter' | 'prop' | 'npc' | 'ground'; id?: string; instanceId?: string };
    tap(world: Pt): void;
    goToExit(portalId: string): void;
    debugTeleport(p: Pt): void;
    debugCritterAt(id: string): Pt | undefined;
    travel(to: { mapId: string; spawnId: string }): Promise<void>;
    debugFreeze(on: boolean): void;
    debugStep(seconds: number): void;
    debugParticles(): number;
    /** The season the place on the screen is drawn in: summer for a place with a roof. */
    seasonShown: 'spring' | 'summer' | 'autumn' | 'winter';
    /** What falls over the place on the screen, and how many of it are in the air. */
    debugWeather(): { fall: 'snow' | 'leaves' | 'petals' | null; visible: number };
    debugClearEffects(): void;
    /**
     * Shortens how long a change of place waits for the device and for the next place, in
     * milliseconds.
     */
    debugPatience(patience: Partial<{ save: number; load: number }>): void;
    advance(seconds: number): void;
  };
  /** The asset manifest the page loaded, as far as these tests read it. */
  manifest: {
    maps: Record<string, { file: string }>;
    audio?: {
      loops: Record<string, { decodedBytes: number }>;
      sheets: Record<string, { decodedBytes: number }>;
      speech?: { clips: Record<string, { file: string }> };
    };
  };
  /**
   * What the simulation's own invariant check finds wrong with the world as it stands. Empty when
   * all is well.
   */
  invariants(): string[];
  /** What went wrong in a frame or an event and was carried past, by where. */
  faults: { total: number; counts: ReadonlyMap<string, number>; repaired: { touch: number; freed: number } };
  store: {
    current(): Promise<{ save: { recruited: string[]; wildstar: { position: Pt }; mapId: string } } | null>;
    /** What the player has learned, as the device holds it. */
    learner(): Promise<{ words: Record<string, unknown> } | undefined>;
    history(): Promise<unknown[]>;
    quarantined(): Promise<unknown[]>;
    settings(): Promise<Settings>;
    backups(): Promise<{ reason: string; save: { recruited: string[] } }[]>;
    commit(...args: unknown[]): Promise<void>;
  } | null;
  stage: {
    scene: {
      input: { enabled: boolean };
      cameras: { main: { fadeEffect: { isRunning: boolean } } };
      children: { list: unknown[] };
    };
    game: {
      canvas: HTMLCanvasElement;
      /**
       * The engine's own events: `prerender` comes after the game has updated and before the
       * picture is drawn.
       */
      events: { once(event: string, listener: () => void): unknown };
      loop: { running: boolean; frame: number; actualFps: number };
      renderer: { contextLost: boolean; gl: WebGL2RenderingContext };
      textures: { list: Record<string, { source: { width: number; height: number }[] }> };
    };
  };
  saves: {
    flush(world: unknown): Promise<void>;
    request(reason: string, world: unknown): void;
    status: { state: string };
  };
  visit: Visit;
  /** The page's own layer, for looking at what it shows without playing up to it. */
  ui: { unicornFound(id: string, found: string[]): void };
  /** The playground games' screen, for looking at the game that is up and for ending it. */
  wonders: {
    isOpen: boolean;
    state: {
      open: boolean;
      where: 'opening' | 'open' | 'closing';
      game: string | null;
      phase: 'play' | 'finale' | 'after' | null;
      stars: number;
      lit: number;
      flying: number;
      slept: boolean;
    };
    inside: {
      stage: {
        time: number;
        quality: number;
        cost: number;
        frames: number;
        view: { w: number; h: number; unit: number };
        step(seconds: number): void;
        /** Takes away the clock the game runs by itself. */
        stop(): void;
        inject(kind: 'down' | 'move' | 'up', id: number, x: number, y: number): void;
      };
      wonder: { stars: number; progress: number; phase: string; celebrate(): void; restart(): void };
    } | null;
    open(site: { game: string; look?: string; at: Pt }): void;
    close(): void;
  };
  outcome: { kind: 'fresh' | 'resume' | 'too-new' };
  audio: { stats(): AudioStats } | null;
  /**
   * What full-screen games make their sound with. `busy` is how many of its sounds are alive now,
   * `nodes` how many nodes they are made of, and `lost` how many the browser refused part of.
   */
  synth: {
    busy: number;
    nodes: number;
    lost: number;
    now(): number;
    fx(name: string, options?: { pitch?: number; step?: number }): void;
    note(voice: string, midi: number, options?: { bus?: 'effects' | 'music'; delay?: number; seconds?: number }): void;
  } | null;
  /** How much the game asks of this device, as it chose. */
  profile: { soundBudget: number };
  settings: { get(): Settings; update(patch: Partial<Settings>): void; flush(): Promise<void> };
  /** What the player has learned on this device. */
  learner: {
    get(): {
      schemaVersion: number;
      words: Record<string, { spell?: Progress; read?: Progress }>;
      sentences?: Record<string, Progress>;
      floor?: number;
    };
    set(profile: unknown): void;
    flush(): Promise<void>;
  };
  /**
   * The lesson, for asking whether a card is up, opening a word's card, which word the player asked
   * to be shown the way to, and setting how long a finished card waits before it goes on by itself.
   */
  lessons: { busy: boolean; seeking: string | null; practice(word: string): boolean; autoContinueMs: number };
  /**
   * The recorded voice: whether the game has one, the clips it has begun (newest last), and how
   * much of it is held decoded.
   */
  voice: {
    available: boolean;
    heard: string[];
    stats(): { resident: number; clips: number; live: number; loading: number; started: number };
  };
  /** What the browser has promised about keeping what is stored here. */
  durable: { get(): 'promised' | 'not-promised' | 'unknown' };
  /** The Spell Book and the button in the corner that opens it. */
  spellBook: { isOpen: boolean; open(): void; close(): void };
  bookChip: { node: HTMLElement };
  /**
   * The reading computer: `seat` brings down what it is made of, and `reader` is the session once
   * it is made, and nothing before.
   */
  reading: { seat(): Promise<unknown>; reader: { busy: boolean; stayMs: number } | null };
  /** The memory table, the same way: `game` is the session once it is made, and nothing before. */
  memory: { seat(): Promise<unknown>; game: { busy: boolean } | null };
  /** The maths table, the same way, with what its screen is showing now. */
  maths: { seat(): Promise<unknown>; game: { busy: boolean; showing: MathsView | null } | null };
  /** What the player did at the tables, on this device. */
  play: { get(): PlayRecord; set(next: unknown): void; flush(): Promise<void> };
  /** Null in a development server, where there is no service worker. */
  offline: {
    status: {
      kind: 'unsupported' | 'preparing' | 'ready' | 'update-ready' | 'trouble';
      done?: number;
      total?: number;
      detail?: string;
    };
    checkForUpdate(): void;
    retry(): Promise<void>;
    repair(): Promise<void>;
    activate(): Promise<boolean>;
  } | null;
}

interface Settings {
  musicVolume: number;
  effectsVolume: number;
  muted: boolean;
  reducedEffects: boolean;
  startFresh: boolean;
  startPlace: 'forest' | 'palace';
  season: 'auto' | 'spring' | 'summer' | 'autumn' | 'winter';
  zoom: number;
  learning: LearningSettings;
}

export interface LearningSettings {
  on: boolean;
  say: boolean;
  keyboard: 'abc' | 'qwerty';
  letters: 'upper' | 'lower';
  help: 'full' | 'some' | 'little';
  ask: 'often' | 'sometimes' | 'rarely';
  friends: boolean;
  mathsSay: boolean;
  mathsKeys: boolean;
}

/**
 * How an opening treats the saved world: carries on with it (`kept`), starts from scratch and
 * leaves it alone (`fresh`), or looks around (`incognito`). The first two are asked for in the
 * address, and `setting` leaves it to the device's own choice.
 */
export type Visit = 'kept' | 'fresh' | 'incognito' | 'setting';

export interface AudioStats {
  state: 'idle' | 'running' | 'suspended' | 'failed';
  sampleRate: number;
  decodedBytes: number;
  sheets: string[];
  loops: { music: string | null; ambience: string | null };
  voices: number;
  worldShare: number;
}

declare global {
  interface Window {
    __ua?: Ua;
    __sounds?: { family: string; played: boolean }[];
    __meter?: AnalyserNode;
    /**
     * What the test browser kept from the speakers and from the voice of the device: how many
     * outputs it shut, and the words the device was asked to say, which the game never asks.
     */
    __silence?: { gated: number; spoken: string[] };
  }
}

/**
 * How long the game may take to boot. A machine that other work has starved can need many times
 * what a quiet one does, and a run on one says so with UA_BOOT_MS.
 */
export const BOOT_MS = Number(process.env.UA_BOOT_MS ?? 120_000);

/**
 * What the waits in these helpers are multiplied by. A run on a machine that other work has starved
 * says so with UA_PATIENCE=4, and a real defect fails all the same, only later.
 */
export const PATIENCE = Number(process.env.UA_PATIENCE ?? 1);

/**
 * The files of the fine sheets of the unicorns. The game asks for them once play has begun, so what
 * a unicorn is drawn from depends on how long the game has been up.
 */
export const FINE_SHEET = /\/unicorns\/[a-z]+\.fine-\d\.[0-9a-f]{10}\.webp$/;

/**
 * Keeps the fine sheets from coming, so a unicorn is drawn from her first sheet alone, as she is on
 * a device that does not load them. Call it before the game is opened.
 */
export const withoutFineSheets = async (page: Page): Promise<void> => {
  await page.route(FINE_SHEET, (route) => route.abort());
};

/**
 * Waits until every fine sheet of a unicorn is in the engine with its pictures cut. The game goes
 * on loading in real time while it is frozen. A game that is not given them (low-end mode, or a
 * browser that says it has under 4 GB of memory) never brings them, and says so.
 */
export async function waitForFine(page: Page, id: string): Promise<void> {
  const reach = await page.evaluate(
    () => (window.__ua as unknown as { profile: { fineFacings: string } }).profile.fineFacings,
  );
  const memory = await page.evaluate(() => (navigator as unknown as { deviceMemory?: number }).deviceMemory);
  expect(
    reach === 'herd' || (reach === 'leader' && id === 'wildstar'),
    `${id} is not given the fine facings in this browser (they go to ${reach}; navigator.deviceMemory is ${memory})`,
  ).toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate((who) => {
          const ua = window.__ua as unknown as {
            stage: {
              scene: { textures: { exists(key: string): boolean; get(key: string): { has(frame: string): boolean } } };
            };
            manifest: { unicorns: Record<string, { fine?: { atlases: { rects: unknown[] }[] } }> };
          };
          const textures = ua.stage.scene.textures;
          const sheets = ua.manifest.unicorns[who]!.fine!.atlases;
          return sheets.every(
            (sheet, p) =>
              textures.exists(`unicorn:${who}:${p}`) &&
              textures.get(`unicorn:${who}:${p}`).has(String(sheet.rects.length - 1)),
          );
        }, id),
      { timeout: 120_000, intervals: [500] },
    )
    .toBe(true);
}

/**
 * What a Fire HD 10 sends as Silk: the model code and the browser's name. The game takes it for a
 * slow tablet.
 */
export const SILK =
  'Mozilla/5.0 (Linux; Android 9; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/116.6.1 like Chrome/116.0.0.0 Safari/537.36';

/**
 * Loads the game with its test hooks and waits until the title is up. A new device has learning on,
 * and most tests are about the game the player knows, so a test opens it with learning off, as a
 * parent would put it: that choice is kept on the device, so a reload stays off too. A test of
 * learning as it is found says `learning: true`. Most tests are about how the game plays, saves and
 * is looked after, and open it the way a parent has set it to carry on with the world on the device
 * (`?keep`). A test of the other ways to open it says which. `query` is added to the address.
 */
export async function openGame(
  page: Page,
  visit: Visit = 'kept',
  query = '',
  { learning = false }: { learning?: boolean } = {},
): Promise<void> {
  // WebKit has no mute switch and plays through the speakers of whoever runs the tests, so the
  // output is shut first.
  await silence(page.context());
  await page.goto(
    { kept: '/?test&keep', fresh: '/?test&fresh', incognito: '/?test&incognito', setting: '/?test' }[visit] + query,
  );
  await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
  await page.getByRole('button', { name: 'Play' }).waitFor();
  if (!learning) {
    await page.evaluate(async () => {
      const { settings } = window.__ua!;
      settings.update({ learning: { ...settings.get().learning, on: false } });
      await settings.flush();
    });
  }
}

export async function play(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play' }).click({ force: true });
  await page.waitForFunction(() => window.__ua?.controller.phase === 'playing', undefined, {
    polling: 200,
    timeout: 30_000 * PATIENCE,
  });
}

/**
 * Takes the clock away from real time. The browser used for tests draws in software and can be many
 * times slower than a phone, so a test that waited for the game to walk somewhere would be
 * measuring the machine. Tests step game time instead, and the same steps run the same way every
 * time.
 */
export async function freeze(page: Page): Promise<void> {
  await page.evaluate(() => window.__ua!.controller.debugFreeze(true));
}

/**
 * Runs a frozen game forward, then lets the engine draw once. The camera's picture of the world is
 * only refreshed when it draws, and a tap lands where the last drawn frame showed things, as it
 * does for a player.
 */
export async function step(page: Page, seconds: number): Promise<void> {
  await page.evaluate(async (s) => {
    window.__ua!.controller.debugStep(s);
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  }, seconds);
}

/**
 * Taps a world position through the real pointer path: the canvas, the tap gesture, the hit test.
 */
export async function tapWorld(page: Page, world: Pt): Promise<void> {
  const size = page.viewportSize()!;
  const where = () => page.evaluate((p) => window.__ua!.controller.toScreen(p), world);
  const off = (p: Pt): boolean => p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height;
  let at = await where();
  // The camera follows by the real frame clock, so on a busy machine it can be a little behind a
  // leader who was just put somewhere. It is given a few more steps to catch up before the tap is
  // called a miss.
  for (let tries = 0; tries < 6 && off(at); tries++) {
    await step(page, 0.5);
    at = await where();
  }
  if (off(at)) {
    throw new Error(
      `tapWorld: (${Math.round(world.x)}, ${Math.round(world.y)}) is off screen at (${Math.round(at.x)}, ${Math.round(at.y)}) in ${size.width}x${size.height}`,
    );
  }
  await page.mouse.click(at.x, at.y);
}

/**
 * Runs a frozen game forward a second at a time until something is true, and says so if it never
 * is. For things that happen when a walk ends or an animation finishes, where the moment depends on
 * distances a test should not have to work out.
 */
export async function stepUntil(page: Page, what: string, check: () => boolean, seconds = 20): Promise<void> {
  for (let waited = 0; waited < seconds; waited++) {
    if (await page.evaluate(check)) return;
    await step(page, 1);
  }
  if (!(await page.evaluate(check)))
    throw new Error(`stepUntil: ${what} had not happened after ${seconds} seconds of game time`);
}

/**
 * Sends every creature of this map away. A butterfly or a fairy that drifts across a unicorn takes
 * a tap meant for her, as it should, and a test that taps a unicorn on purpose must not leave that
 * to chance.
 */
export const hush = (page: Page): Promise<void> =>
  page.evaluate(() => {
    window.__ua!.controller.world.life.critters.length = 0;
  });

/** Puts the leader somewhere without walking and lets the camera and the herd settle there. */
export async function standAt(page: Page, at: Pt): Promise<void> {
  await page.evaluate((p) => window.__ua!.controller.debugTeleport(p), at);
  await step(page, 1.5);
}

/**
 * Puts the leader on open ground a short walk below a prop. A world unit is about a pixel on a
 * phone held sideways, so a prop much farther than this is off the screen and a tap on it would
 * land on nothing.
 */
export async function standBelow(page: Page, instanceId: string, distance = 130): Promise<void> {
  const at = await page.evaluate(
    ({ id, d }) => {
      const { world } = window.__ua!.controller;
      const { hit } = world.interactables.get(id)!;
      return world.nav.freePointNear({ x: hit.x + hit.w / 2, y: hit.y + hit.h + d }, [], 0, 200);
    },
    { id: instanceId, d: distance },
  );
  if (!at) throw new Error(`standBelow: no open ground near ${instanceId}`);
  await standAt(page, at);
}

/** The middle of the area that answers a tap on a prop. */
export const centreOf = (page: Page, instanceId: string): Promise<Pt> =>
  page.evaluate((id) => {
    const { hit } = window.__ua!.controller.world.interactables.get(id)!;
    return { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 };
  }, instanceId);

/** Where the herd stands to use a prop. */
export const approachOf = (page: Page, instanceId: string): Promise<Pt> =>
  page.evaluate((id) => {
    const map = window.__ua!.controller.world.map as unknown as {
      interactables: { instanceId: string; approach: { pos: Pt }[] }[];
    };
    return map.interactables.find((i) => i.instanceId === id)!.approach[0]!.pos;
  }, instanceId);

/**
 * A point on a prop where a tap lands on it and not on a neighbour drawn in front, found with the
 * game's own idea of what a tap lands on. Props in a crowded place overlap, and the one in front
 * takes the tap. The point is kept clear of the edges of the screen, where the bubbles that point
 * the way out hang, and a few pixels clear of every button of the screen, because a bubble pulses a
 * little past its box and a finger that lands on the edge of one presses it.
 */
export async function spotOn(page: Page, instanceId: string): Promise<Pt> {
  const size = page.viewportSize()!;
  const spot = await page.evaluate(
    ({ id, w, h }) => {
      const { controller } = window.__ua!;
      const { hit } = controller.world.interactables.get(id)!;
      const middle = { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 };
      const clear = (s: { x: number; y: number }): boolean =>
        [
          [0, 0],
          [6, 0],
          [-6, 0],
          [0, 6],
          [0, -6],
        ].every(([dx, dy]) => document.elementsFromPoint(s.x + dx!, s.y + dy!)[0] instanceof HTMLCanvasElement);
      let best: Pt | null = null;
      let nearest = Infinity;
      for (let x = hit.x; x <= hit.x + hit.w; x += 10) {
        for (let y = hit.y; y <= hit.y + hit.h; y += 10) {
          const target = controller.targetAt({ x, y });
          if (target.kind !== 'prop' || target.instanceId !== id) continue;
          const at = controller.toScreen({ x, y });
          if (at.x < w * 0.12 || at.x > w * 0.88 || at.y < h * 0.18 || at.y > h * 0.89) continue;
          const away = Math.hypot(x - middle.x, y - middle.y);
          if (away < nearest && clear(at)) {
            best = { x, y };
            nearest = away;
          }
        }
      }
      return best;
    },
    { id: instanceId, w: size.width, h: size.height },
  );
  if (!spot) throw new Error(`no clear place to tap ${instanceId}`);
  return spot;
}

/**
 * Stands the leader close below the creature of one kind that has the most room around it, and says
 * which one it is. A tap goes to whoever is in front under the finger, so a lone one is the only
 * one a test can count on to answer. She stands close, because the screen of a phone held sideways
 * shows barely a hundred and eighty units above the leader. A button of the screen can lie over a
 * creature near the top of such a screen, such as the exit that points at the wonder gallery, and a
 * finger on it presses the button and not the creature, so the next lonely one is tried when what
 * shows at this one is not the canvas.
 */
export async function standBelowLoneliest(page: Page, kind: string): Promise<{ id: string; at: Pt }> {
  const ranked = await page.evaluate((k) => {
    const { critters } = window.__ua!.controller.world.life;
    const room = (c: { id: string; pos: { x: number; y: number } }): number =>
      Math.min(...critters.filter((o) => o.id !== c.id).map((o) => Math.hypot(o.pos.x - c.pos.x, o.pos.y - c.pos.y)));
    return critters
      .filter((c) => c.kind === k)
      .map((c) => ({ id: c.id, room: room(c) }))
      .sort((a, b) => b.room - a.room)
      .map((c) => c.id);
  }, kind);
  for (const id of ranked) {
    const under = await page.evaluate((who) => {
      const { world } = window.__ua!.controller;
      const c = world.life.critters.find((x) => x.id === who)!;
      return world.nav.freePointNear({ x: c.pos.x, y: c.pos.y + 40 }, [], 0, 200);
    }, id);
    if (!under) continue;
    await standAt(page, under);
    await step(page, 0.1);
    const at = await page.evaluate((who) => {
      const ctl = window.__ua!.controller;
      const drawn = ctl.debugCritterAt(who);
      if (!drawn) return null;
      const s = ctl.toScreen(drawn);
      const onScreen = s.x >= 0 && s.y >= 0 && s.x <= window.innerWidth && s.y <= window.innerHeight;
      return onScreen && document.elementsFromPoint(s.x, s.y)[0] instanceof HTMLCanvasElement ? drawn : null;
    }, id);
    if (at) return { id, at };
  }
  throw new Error(`no ${kind} has open ground below it and is drawn where a finger lands on the canvas`);
}

/**
 * A point on a unicorn's body, a little above her feet, where a finger would land, and where the
 * game says the tap is for her when there is such a point: a neighbour who stands in front of her
 * takes the taps on the part of her that is behind. A friend who stands at the top edge of a short
 * screen has her back cut off by it, and the finger then lands lower, on the part of her that
 * shows. A button of the screen can lie over her too, such as the exit that points at the cave on a
 * sharp phone, where the world is drawn smaller, and a finger on it presses the button and not her,
 * so a point that shows the canvas is chosen before one that does not.
 */
export const bodyOf = (page: Page, id: string): Promise<Pt> =>
  page.evaluate((who) => {
    const c = window.__ua!.controller;
    const u = c.world.unicorns[who]!;
    const shown = [52, 40, 28, 16]
      .map((rise) => ({ x: u.pos.x, y: u.pos.y - rise }))
      .filter((at) => c.toScreen(at).y >= 6);
    const isHers = (at: { x: number; y: number }): boolean => {
      const target = c.targetAt(at);
      return target.kind === 'unicorn' && target.id === who;
    };
    const bare = (at: { x: number; y: number }): boolean => {
      const s = c.toScreen(at);
      return document.elementsFromPoint(s.x, s.y)[0] instanceof HTMLCanvasElement;
    };
    const hers = shown.find((at) => isHers(at) && bare(at)) ?? shown.find(isHers);
    return hers ?? shown[0] ?? { x: u.pos.x, y: u.pos.y - 16 };
  }, id);

/**
 * What the screen shows of a unicorn, with the clip she is in and the frames the manifest gives
 * that clip.
 */
export interface Picture {
  clip: string;
  /** The facing she is drawn in, a number from 0 to 31 clockwise round the map from east. */
  facing: number;
  /** Whether her picture is turned about her feet. */
  flipX: boolean;
  /** The frame of her sheet that is drawn. */
  frame: string;
  /** Every frame of the clip she is in, so a test can say the picture is of what she is doing. */
  clipFrames: string[];
}

/**
 * The picture of a unicorn as the game last drew it: the image itself, not what the world says it
 * should be.
 */
export const pictureOf = (page: Page, id: string): Promise<Picture> =>
  page.evaluate((who) => {
    const ua = window.__ua as unknown as {
      controller: { world: { unicorns: Record<string, { anim: { clip: string; facing: number } }> } };
      manifest: { unicorns: Record<string, { clips: Record<string, Record<string, { frames: { rect: number }[] }>> }> };
      stage: {
        scene: { children: { list: { texture?: { key: string }; flipX?: boolean; frame?: { name: string } }[] } };
      };
    };
    const { clip, facing } = ua.controller.world.unicorns[who]!.anim;
    const image = ua.stage.scene.children.list.find((c) => c.texture?.key === `unicorn:${who}`);
    if (!image?.frame) throw new Error(`pictureOf: nothing of ${who} is on the screen`);
    const clipFrames = ua.manifest.unicorns[who]!.clips[clip]![facing]!.frames.map((f) => String(f.rect));
    return { clip, facing, flipX: image.flipX === true, frame: image.frame.name, clipFrames };
  }, id);

/**
 * Walks up to a friend in the forest and taps her, as a child does, and runs time until she has
 * joined the herd. The leader stands on the open ground nearest to a spot below and beside her,
 * which is where a person would walk to. A friend strolls about her home while the camera settles,
 * so if she has gone off the top of a short screen the leader goes to where she is now.
 */
export async function befriend(page: Page, id: string, o: { party?: boolean } = {}): Promise<void> {
  await hush(page);
  for (let tries = 0; tries < 3; tries++) {
    const at = await page.evaluate((who) => {
      const { world } = window.__ua!.controller;
      const friend = world.unicorns[who]!;
      return world.nav.freePointNear({ x: friend.pos.x - 40, y: friend.pos.y + 100 }, [], 0, 200);
    }, id);
    if (!at) throw new Error(`befriend: no open ground beside ${id}`);
    await standAt(page, at);
    const shown = await page.evaluate(
      (p) => {
        const s = window.__ua!.controller.toScreen(p);
        return s.x >= 0 && s.y >= 0 && s.x <= window.innerWidth && s.y <= window.innerHeight;
      },
      await bodyOf(page, id),
    );
    if (shown) break;
  }
  await tapWorld(page, await bodyOf(page, id));
  await step(page, 14);
  const recruited = await page.evaluate(() => window.__ua!.controller.world.persistent.recruited);
  expect(recruited).toContain(id);
  // The last friend brings the party: a scene of its own that takes the screen a moment after, so
  // it is watched to its end before the test goes on.
  if (recruited.length === FRIENDS.length + 1 && o.party !== false) await watchScene(page, 'finder-finale');
}

export const befriendLeaf = (page: Page): Promise<void> => befriend(page, 'leaf');

/** The five friends, in the order a visit meets them. */
export const FRIENDS = ['leaf', 'glacier', 'river', 'cinder', 'storm'] as const;

/**
 * Waits for a map change to finish: the new map is the one in play and the picture has faded back
 * in.
 */
export async function untilArrived(page: Page, id: string): Promise<void> {
  const long = { timeout: 60_000 * PATIENCE, intervals: [250, 500] };
  await expect.poll(() => mapId(page), long).toBe(id);
  await expect.poll(() => page.evaluate(() => window.__ua!.controller.phase), long).toBe('playing');
  await expect
    .poll(() => page.evaluate(() => window.__ua!.stage.scene.cameras.main.fadeEffect.isRunning), long)
    .toBe(false);
}

/**
 * Runs a tenth of a second at a time until the toy has begun its reaction, so a short one is not
 * stepped over.
 */
export async function untilDelighted(page: Page, instanceId: string): Promise<void> {
  for (let tenths = 0; tenths < 100; tenths++) {
    if (await page.evaluate((i) => window.__ua!.controller.world.transient.get(i)?.kind === 'delight', instanceId))
      return;
    await step(page, 0.1);
  }
  await shot(page, `${SCRATCH}/${instanceId.replace('/', '-')}-stuck.png`);
  throw new Error(`${instanceId} did not react to a tap within ten seconds of game time`);
}

/** Waits for a toy's game to be up and ends it with the button in the corner, as she would. */
export async function handBack(page: Page, instanceId: string): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__ua!.wonders.state.where), {
      message: `${instanceId}'s game opening`,
      timeout: 20_000,
    })
    .toBe('open');
  await shot(page, `${SCRATCH}/${instanceId.replace('/', '-')}-game.png`);
  await page.locator('.wonder-done').click();
  await expect
    .poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), {
      message: `${instanceId}'s game closing`,
      timeout: 20_000,
    })
    .toBe(false);
}

/**
 * Waits for the game a toy opened to be on the screen, and takes away the clock it runs by itself.
 * From then on the game's time is what a test gives it with `stage.step`. A test that steps by hand
 * while that clock runs races it, and the count in, a balloon on its way up or the first stretch of
 * a climb is over or somewhere else by the time the test looks, by as much as the browser is slow.
 */
export async function untilOpen(page: Page, seconds = 20): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__ua!.wonders.state.where), {
      message: 'the picture opening',
      timeout: seconds * 1000 * PATIENCE,
    })
    .toBe('open');
  await page.evaluate(() => window.__ua!.wonders.inside?.stage.stop());
}

/** Waits for the screen a game or a scene took to be given back. */
export const untilClosed = (page: Page, seconds = 20): Promise<void> =>
  expect
    .poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), {
      message: 'the screen to be given back',
      timeout: seconds * 1000 * PATIENCE,
      intervals: [100, 250],
    })
    .toBe(false);

/**
 * Waits for a scene that is watched and not played to open over the world, says which one it is,
 * runs it to its end in its own time, and waits for the screen to be given back. The scene's own
 * clock is stepped so a test does not sit through every second of it, and the shell's real timers
 * still do the closing, the way they would for a child.
 */
export async function watchScene(page: Page, game: string, seconds = 12): Promise<void> {
  const quick = { timeout: 15_000 * PATIENCE, intervals: [100, 250] };
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), quick).toBe(true);
  expect(await page.evaluate(() => window.__ua!.wonders.state.game), 'the scene that opened').toBe(game);
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.state.where), quick).not.toBe('opening');
  if ((await page.evaluate(() => window.__ua!.wonders.state.where)) === 'open')
    await page.evaluate((s) => window.__ua!.wonders.inside?.stage.step(s), seconds);
  await untilClosed(page);
}

/** What a long scene noticed along the way, so a test can say it once at the end. */
export interface Watch {
  /** Anything the simulation's invariant check found wrong, with where and when. */
  problems: string[];
  /** The farthest any recruited unicorn has been from Wildstar. */
  worstLag: number;
  /** Game seconds run so far, across every map. Each map is a new world with its own clock. */
  seconds: number;
}

export const newWatch = (): Watch => ({ problems: [], worstLag: 0, seconds: 0 });

/**
 * Runs a frozen game forward a second, and asks the simulation whether anything it promises has
 * broken.
 */
export async function stepAndLook(page: Page, watch: Watch): Promise<void> {
  await step(page, 1);
  watch.seconds++;
  const look = await page.evaluate(() => {
    const { world } = window.__ua!.controller;
    const lead = world.unicorns.wildstar!.pos;
    let lag = 0;
    for (const id of world.persistent.recruited) {
      const u = world.unicorns[id];
      if (u) lag = Math.max(lag, Math.hypot(u.pos.x - lead.x, u.pos.y - lead.y));
    }
    return { at: Math.round(world.time), map: world.map.id, lag, found: window.__ua!.invariants() };
  });
  watch.worstLag = Math.max(watch.worstLag, look.lag);
  for (const what of look.found) watch.problems.push(`${look.map} at ${look.at}s: ${what}`);
}

/** Stands the herd still for a while, watching as it goes. */
export async function stepWatching(page: Page, seconds: number, watch: Watch): Promise<void> {
  for (let i = 0; i < seconds; i++) await stepAndLook(page, watch);
}

/**
 * Sends the herd through the portal that leads to `to`, by one tap on its door, or by the call its
 * edge bubble makes if it has no door, and waits until they have arrived. The leader walks the
 * whole way, so the followers do too. A door that is not on screen cannot be tapped through the
 * pointer, which is why this taps the world directly.
 *
 * A fairy that drifts across a door takes a tap meant for the door, as it should for a child, and
 * the herd would stand where it is. So the door is tapped where nothing lies over it, and what lies
 * over it is looked at and the tap made in the same breath, so nothing can move in between.
 */
export async function walkThrough(page: Page, to: string, watch: Watch, limit = 150): Promise<void> {
  const from = await mapId(page);
  const sent = await page.evaluate((dest) => {
    const c = window.__ua!.controller;
    const portal = c.world.map.portals.find((p) => p.to.mapId === dest);
    if (!portal) throw new Error(`there is no way from here to ${dest}`);
    const hit = portal.door ? c.world.interactables.get(portal.door)?.hit : undefined;
    // A gateway has no door to tap, and the leader may be standing where its middle is drawn, so it
    // is asked for the way out the same as its edge bubble asks.
    if (!portal.door || !hit) {
      c.goToExit(portal.portalId);
      return true;
    }
    for (const down of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      for (const across of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        const at = { x: hit.x + hit.w * across, y: hit.y + hit.h * down };
        const target = c.targetAt(at);
        if (target.kind === 'prop' && target.instanceId === portal.door) {
          c.tap(at);
          return true;
        }
      }
    }
    return false;
  }, to);
  if (!sent)
    throw new Error(`walkThrough: something lies over every part of the door to ${to}, so it cannot be tapped`);
  let leaving = false;
  for (let s = 0; s < limit && !leaving; s++) {
    await stepAndLook(page, watch);
    leaving = (await mapId(page)) !== from || (await page.evaluate(() => window.__ua!.controller.phase)) !== 'playing';
  }
  if (!leaving)
    throw new Error(`walkThrough: the herd had not left ${from} for ${to} after ${limit} seconds of game time`);
  await untilArrived(page, to);
}

export const mapId = (page: Page): Promise<string> => page.evaluate(() => window.__ua!.controller.world.map.id);

/**
 * Takes a picture of the page once it has settled. A test that holds the page's clock
 * (`page.clock`) says `settle: false`, because a page whose clock is held draws nothing by itself
 * and would be waited on for ever.
 */
export async function shot(page: Page, path: string, { settle = true }: { settle?: boolean } = {}): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  if (settle) await settled(page);
  await page.screenshot({ path });
}

/**
 * Waits for everything that moves and then stops to have stopped, and for two frames to be drawn. A
 * screenshot of a page that is still rising into place is a picture of a page that is half there,
 * and on a busy machine it is taken before the page has had the time to finish, whatever was waited
 * for. An animation that a test paused has stopped already and never finishes, so it is not waited
 * for.
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const moving = document
      .getAnimations()
      .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(moving.map((a) => a.finished.catch(() => undefined)));
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
}

export const SCRATCH = 'assets/source/_scratch/e2e';

export const GEAR = /^Parent controls$/;

export const PARENT = { name: 'Parent controls' } as const;

/** Taps the gear, which is all a parent does, and waits for the controls to come up. */
export async function openParent(page: Page): Promise<void> {
  await page.getByRole('button', { name: GEAR }).click();
  await expect(page.getByRole('dialog', PARENT)).toBeVisible();
}

/**
 * Closes the controls with the keyboard and waits until the sheet has left, so the next look at the
 * page sees no leftover.
 */
export async function closeParent(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

export async function goTo(page: Page, tab: string): Promise<void> {
  await page.getByRole('tab', { name: tab }).click();
}

export const audioStats = (page: Page): Promise<AudioStats> => page.evaluate(() => window.__ua!.audio!.stats());

/**
 * Waits until the sound is awake with every sheet decoded and the music and ambience for `map`
 * running.
 */
export async function untilSounding(
  page: Page,
  loops: AudioStats['loops'] = { music: 'music-forest', ambience: 'ambience-forest' },
): Promise<void> {
  const long = { timeout: 60_000 * PATIENCE, intervals: [250, 500, 1000] };
  await expectPoll(async () => (await audioStats(page)).state, long).toBe('running');
  await expectPoll(async () => (await audioStats(page)).sheets.length, long).toBe(3);
  await expectPoll(async () => (await audioStats(page)).loops, long).toEqual(loops);
}

/**
 * Starts measuring what leaves the game's master volume, the one place all its sound passes. A test
 * cannot hear, but it can see whether signal is flowing and whether mute stops it. This reaches
 * into the engine's private graph on purpose.
 */
export async function tapMasterBus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const engine = (window.__ua!.audio as unknown as { engine: { ctx: AudioContext; buses: { master: GainNode } } })
      .engine;
    const analyser = engine.ctx.createAnalyser();
    analyser.fftSize = 2048;
    engine.buses.master.connect(analyser);
    window.__meter = analyser;
  });
}

/**
 * The loudest short-term level (RMS, 0 to 1 of full scale) at the master volume over about half a
 * second.
 */
export const level = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const meter = window.__meter!;
    const samples = new Float32Array(meter.fftSize);
    let loudest = 0;
    for (let i = 0; i < 12; i++) {
      meter.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      loudest = Math.max(loudest, Math.sqrt(sum / samples.length));
      await new Promise((done) => setTimeout(done, 40));
    }
    return loudest;
  });

/**
 * Records every sound the game asks the engine for from now on, and whether the engine had it ready
 * to play.
 */
export async function listenForSounds(page: Page): Promise<void> {
  await page.evaluate(() => {
    const engine = (window.__ua!.audio as unknown as { engine: { play(request: { family: string }): unknown } }).engine;
    const real = engine.play.bind(engine);
    window.__sounds = [];
    engine.play = (request) => {
      const voice = real(request);
      window.__sounds!.push({ family: request.family, played: voice !== null });
      return voice;
    };
  });
}

export const soundsHeard = (page: Page): Promise<{ family: string; played: boolean }[]> =>
  page.evaluate(() => window.__sounds ?? []);

const expectPoll = <T>(read: () => Promise<T>, options: { timeout: number; intervals: number[] }) =>
  expect.poll(read, options);

/**
 * Collects what the page logs as warnings or errors, so a test can say that a normal session is
 * quiet. The browser used for tests draws in software and says so now and then; that is the machine
 * talking, not the game.
 */
export function watchConsole(page: Page): string[] {
  const noise: string[] = [];
  const machine = /GL Driver Message|GPU stall|swiftshader|software rendering|WebGL.*(performance|fallback)/i;
  page.on('console', (m) => {
    if ((m.type() === 'warning' || m.type() === 'error') && !machine.test(m.text()))
      noise.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    noise.push(`pageerror: ${e.message}`);
  });
  return noise;
}

/**
 * Where a finger lands on a toy: the middle if that is clear of the edges of the screen, else lower
 * down. The bubbles that point the way out sit on the edges, and the top one is a long way down
 * from the top, so a tall toy's middle can be under one.
 */
export async function fingerOn(page: Page, instanceId: string): Promise<Pt> {
  const size = page.viewportSize()!;
  const spots = await page.evaluate((id) => {
    const { controller } = window.__ua!;
    const { hit } = controller.world.interactables.get(id)!;
    return [0.5, 0.62, 0.74, 0.86].map((k) => {
      const world = { x: hit.x + hit.w / 2, y: hit.y + hit.h * k };
      return { world, screen: controller.toScreen(world) };
    });
  }, instanceId);
  const clear = spots.find(
    (s) =>
      s.screen.y > size.height * 0.4 &&
      s.screen.y < size.height * 0.89 &&
      s.screen.x > size.width * 0.12 &&
      s.screen.x < size.width * 0.88,
  );
  if (!clear) throw new Error(`no clear place to tap ${instanceId}: ${JSON.stringify(spots.map((s) => s.screen))}`);
  return clear.world;
}

/**
 * Puts the leader on open ground beside a toy, a little below its base. The bubble that points the
 * way out hangs in the upper middle of the screen over her, so a toy she stood in front of would
 * have it, or her, on top of the middle where a finger goes.
 */
export async function standBeside(page: Page, instanceId: string): Promise<void> {
  const at = await page.evaluate((id) => {
    const { world } = window.__ua!.controller;
    const { pos } = world.interactables.get(id)!;
    return (
      world.nav.freePointNear({ x: pos.x - 190, y: pos.y + 24 }, [], 0, 90) ??
      world.nav.freePointNear({ x: pos.x + 190, y: pos.y + 24 }, [], 0, 90)
    );
  }, instanceId);
  if (!at) throw new Error(`no open ground beside ${instanceId}`);
  await standAt(page, at);
}

/**
 * Opens the game, starts it, and goes to the playground with the creatures sent away and the camera
 * settled. The friends found by then are the ones named, met in the forest first the way a child
 * meets them.
 */
export async function inThePlayground(page: Page, friends: readonly string[] = []): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  for (const id of friends) await befriend(page, id);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'playground', spawnId: 'from-garden' }));
  await hush(page);
  await step(page, 1.5);
}

/**
 * How long a finished card waits for a tap in a test: longer than any test looks at it. A card that
 * goes on by itself after a few seconds is right for a child and a race for a test on a busy
 * machine.
 */
const CARD_STAYS_MS = 10 * 60_000;

/**
 * What a parent does in the controls: turns learning on. The voice stays off, so a card says
 * nothing, which is what most tests want. A test of the voice says `say: true`, and the clips the
 * voice has begun are in `window.__ua.voice.heard`, all behind the gate of zero that `openGame`
 * puts before the speakers. A finished card stays until it is tapped (`CARD_STAYS_MS`), and a test
 * of the card going on by itself sets `lessons.autoContinueMs` shorter.
 */
export const learningOn = (page: Page, patch: Partial<LearningSettings> = {}): Promise<void> =>
  page.evaluate(
    ({ learning, stays }) => {
      const { settings, lessons } = window.__ua!;
      lessons.autoContinueMs = stays;
      settings.update({ learning: { ...settings.get().learning, on: true, say: false, ...learning } });
    },
    { learning: patch, stays: CARD_STAYS_MS },
  );

/** The card that asks for a word, as a screen reader finds it. */
export const spellCard = (page: Page): Locator => page.locator('.spell-card');

/** Presses a word's letters on a keyboard. */
export async function typeWord(page: Page, word: string): Promise<void> {
  for (const letter of word) {
    await page.keyboard.press(letter);
    await page.waitForTimeout(70);
  }
}

/** The card's key for a letter. */
export const spellKey = (page: Page, letter: string): Locator => page.locator(`.spell-key[data-letter="${letter}"]`);

/**
 * Taps a word's letters on the card's own keys, the way a child on a phone does. A key that shines
 * is always moving, so it is pressed without waiting for it to stand still.
 */
export async function tapWord(page: Page, word: string): Promise<void> {
  for (const letter of word) {
    await spellKey(page, letter).click({ force: true });
    await page.waitForTimeout(60);
  }
}

/**
 * Waits for the card to say the word is spelled, and presses "Put it in my book", which keeps
 * moving to catch the eye. A tap in the first moments after the last letter is the last key still
 * being pressed, and the card ignores it on purpose, so a tap that did not take is made again. Each
 * try looks first, so a card that has gone is not tapped.
 */
export async function keepWord(page: Page): Promise<void> {
  await expect(page.locator('.spell[data-done="true"]')).toBeVisible();
  await expect(async () => {
    if ((await page.locator('.spell').count()) > 0)
      await page.locator('.spell-collect').click({ force: true, timeout: 1000 });
    await expect(page.locator('.spell')).toHaveCount(0, { timeout: 1000 });
  }).toPass({ intervals: [0, 250, 500], timeout: 30_000 * PATIENCE });
}

/** Whether the world is running, as opposed to resting under a card. */
export const worldRuns = (page: Page): Promise<boolean> => page.evaluate(() => window.__ua!.stage.game.loop.running);

/** The book, as a screen reader finds it. */
export const spellBook = (page: Page): Locator => page.getByRole('dialog', { name: 'My Spell Book' });

/** The button in the corner that opens it. */
export const bookChip = (page: Page): Locator => page.getByRole('button', { name: /^Open my Spell Book/ });

/** A word's place in the book, found or not. */
export const bookWord = (page: Page, word: string): Locator => page.locator(`.book-word[data-word="${word}"]`);

/**
 * The word the player has asked to be shown the way to, or null while they are not looking for one.
 */
export const seeking = (page: Page): Promise<string | null> => page.evaluate(() => window.__ua!.lessons.seeking);

/**
 * What a seeded word has done at one skill: a level, the best level it has reached, and how many
 * clean cards in a row it has at that level.
 */
export interface Seed {
  level?: number;
  best?: number;
  streak?: number;
  due?: number;
  done?: number;
  slips?: number;
}

/**
 * Puts words into the player's book as if they had spelled them. Each is at a level, and `due` is
 * how long from now it is ready to be spelled again, in milliseconds (a negative number is ready
 * already). `done` is how many times they spelled it and `slips` the wrong keys over them. The
 * words are found in the order given, so the last is the newest. `reading` is the same for words
 * they have read, which should be words they have spelled, and a book that holds any is a version 2
 * record, as the game itself writes it. `more` is what the reading computer adds: sentences they
 * have read, by their ids, and the stage a parent started them at. A book that holds either is
 * version 3.
 */
export const seedBook = (
  page: Page,
  words: Record<string, Seed>,
  reading: Record<string, Seed> = {},
  more: { sentences?: Record<string, Seed>; floor?: number } = {},
): Promise<void> =>
  page.evaluate(
    ({ entries, reads, lines, floor }) => {
      const now = Date.now();
      const all = Object.entries(entries);
      const progress = (p: Seed, at: number) => ({
        level: p.level ?? 1,
        best: p.best ?? p.level ?? 1,
        streak: p.streak ?? 0,
        struggles: 0,
        due: now + (p.due ?? 86_400_000),
        done: p.done ?? 1,
        clean: p.done ?? 1,
        slips: p.slips ?? 0,
        first: at,
        last: at,
      });
      const spelled = Object.fromEntries(
        all.map(([word, p], i) => [word, { spell: progress(p, now - (all.length - i) * 1000) }]),
      );
      for (const [word, p] of Object.entries(reads))
        spelled[word] = { ...spelled[word], read: progress(p, now - 500) } as (typeof spelled)[string];
      const sentences = Object.fromEntries(Object.entries(lines).map(([id, p]) => [id, progress(p, now - 500)]));
      const later = Object.keys(sentences).length > 0 || floor !== undefined;
      window.__ua!.learner.set({
        schemaVersion: later ? 3 : Object.keys(reads).length > 0 ? 2 : 1,
        words: spelled,
        ...(Object.keys(sentences).length > 0 ? { sentences } : {}),
        ...(floor !== undefined ? { floor } : {}),
      });
    },
    { entries: words, reads: reading, lines: more.sentences ?? {}, floor: more.floor },
  );

/** Opens the book by tapping the button in the corner, and waits for it. */
export async function openBook(page: Page): Promise<void> {
  await bookChip(page).click();
  await expect(spellBook(page)).toBeVisible();
  // The sheet rises into place, and a tap on it before it has is a tap on something that is still
  // moving.
  await settled(page);
}
