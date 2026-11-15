import { describe, expect, it } from 'vitest';
import { WELCOME_GAMES } from '../../src/game/desk';
import { MemoryGame, MISS_STAYS_MS, WON_AFTER_MS } from '../../src/game/memory-game';
import type { MemoryHandlers, MemoryScreen, MemoryView, PlayLedger } from '../../src/game/play-ports';
import type { ClipId } from '../../src/learning';
import { ALL_CLIPS } from '../../src/learning/course-clips';
import { MEMORY_DONE_CLIP, MEMORY_START_CLIP } from '../../src/learning/play/clips';
import { PAIR_SIZES, withGame } from '../../src/learning/play/memory';
import type { LearningSettings } from '../../src/shared/learning';
import { emptyPlay, type PlayRecord } from '../../src/shared/play';
import { seeded, settings } from '../learning/helpers';
import { Clock } from './clock';

const CLIP_IDS: ReadonlySet<string> = new Set(ALL_CLIPS.map((clip) => clip.id));

class FakeScreen implements MemoryScreen {
  handlers!: MemoryHandlers;
  readonly views: MemoryView[] = [];
  up = false;
  breaks = false;

  constructor(private readonly log: string[]) {}

  show(view: MemoryView): void {
    if (this.breaks) throw new Error('the screen broke');
    this.up = true;
    this.views.push(view);
  }

  close(): void {
    this.up = false;
    this.log.push('close');
  }

  get latest(): MemoryView {
    return this.views[this.views.length - 1]!;
  }
}

interface Rig {
  clock: Clock;
  screen: FakeScreen;
  game: MemoryGame;
  log: string[];
  said: ClipId[][];
  sounds: string[];
  reports: unknown[];
  record: () => PlayRecord;
  setSettings: (patch: Partial<LearningSettings>) => void;
  voice: { audible: boolean };
  stops: () => number;
}

function rig(
  options: {
    record?: PlayRecord;
    settings?: Partial<LearningSettings>;
    seed?: number;
    throwing?: 'sound' | 'voice';
  } = {},
): Rig {
  const clock = new Clock();
  const log: string[] = [];
  const screen = new FakeScreen(log);
  const said: ClipId[][] = [];
  const sounds: string[] = [];
  const reports: unknown[] = [];
  let record = options.record ?? emptyPlay();
  let stopped = 0;
  let current = settings(options.settings);
  const voice = { audible: true };
  const note = (what: string): void => {
    if (options.throwing === 'sound') throw new Error('the sound broke');
    sounds.push(what);
  };
  const play: PlayLedger = {
    get: () => record,
    set: (next) => {
      record = next;
    },
  };
  const game = new MemoryGame({
    settings: () => current,
    play,
    random: seeded(options.seed ?? 5),
    later: clock.later,
    makeScreen: (handlers) => {
      screen.handlers = handlers;
      return screen;
    },
    voice: {
      get audible() {
        return voice.audible;
      },
      say: (clips) => {
        if (options.throwing === 'voice') throw new Error('the voice broke');
        said.push([...clips]);
      },
      stop: () => {
        stopped += 1;
      },
    },
    sounds: {
      open: () => note('open'),
      flip: () => note('flip'),
      pair: (streak) => note(`pair:${streak}`),
      nudge: () => note('nudge'),
      finish: (stars) => note(`finish:${stars}`),
    },
    rest: { freeze: () => void log.push('freeze'), thaw: () => void log.push('thaw') },
    report: (error) => void reports.push(error),
  });
  return {
    clock,
    screen,
    game,
    log,
    said,
    sounds,
    reports,
    record: () => record,
    setSettings: (patch) => {
      current = { ...current, ...patch };
    },
    voice,
    stops: () => stopped,
  };
}

/** The places of the two cards of each picture on the board that is up. */
function pairsOn(r: Rig): number[][] {
  const places = new Map<string, number[]>();
  r.screen.latest.cards.forEach((card, place) => {
    places.set(card.word, [...(places.get(card.word) ?? []), place]);
  });
  return [...places.values()];
}

/** Two places whose cards are not the same picture. */
function notAPair(r: Rig): [number, number] {
  const [a, b] = pairsOn(r);
  return [a![0]!, b![0]!];
}

/**
 * Finds every pair on the board with the pictures in view, and waits for the game to say it is won.
 */
function winIt(r: Rig, mistakes = 0): void {
  for (let i = 0; i < mistakes; i++) {
    const [x, y] = notAPair(r);
    r.screen.handlers.turn(x);
    r.screen.handlers.turn(y);
    r.clock.advance(MISS_STAYS_MS);
  }
  for (const [x, y] of pairsOn(r)) {
    r.screen.handlers.turn(x!);
    r.screen.handlers.turn(y!);
  }
  r.clock.advance(WON_AFTER_MS);
}

const states = (r: Rig): string[] => r.screen.latest.cards.map((card) => card.state);

describe('sitting down at the memory table', () => {
  it('puts up a board of six cards, all face down, holds the world still, and says what to do the first time', () => {
    const r = rig();
    expect(r.game.open()).toBe('up');
    expect(r.game.busy).toBe(true);
    const view = r.screen.latest;
    expect(view.pairs).toBe(3);
    expect(view.cards).toHaveLength(6);
    expect(states(r).every((state) => state === 'down')).toBe(true);
    expect(view.won).toBeNull();
    expect(view.sizes.map((size) => size.pairs)).toEqual([...PAIR_SIZES]);
    expect(view.sizes.filter((size) => size.chosen).map((size) => size.pairs)).toEqual([3]);
    expect(r.log).toEqual(['freeze']);
    expect(r.sounds).toEqual(['open']);
    expect(r.said).toEqual([[MEMORY_START_CLIP]]);
  });

  it('is never put over itself, and is not wanted with learning off', () => {
    const r = rig();
    expect(r.game.open()).toBe('up');
    expect(r.game.open()).toBe('busy');
    const off = rig({ settings: { on: false } });
    expect(off.game.open()).toBe('off');
    expect(off.screen.views).toHaveLength(0);
    expect(off.log).toEqual([]);
  });

  it('stops saying what to do once the player has played a couple of games, and says it again when they ask', () => {
    let record = emptyPlay();
    for (let i = 0; i < WELCOME_GAMES; i++) record = withGame(record, 3, 8);
    const r = rig({ record });
    r.game.open();
    expect(r.said).toEqual([]);
    r.screen.handlers.hear();
    expect(r.said).toEqual([[MEMORY_START_CLIP]]);
  });

  it('starts at the first size the player has not won', () => {
    const r = rig({ record: withGame(emptyPlay(), 3, 6) });
    r.game.open();
    expect(r.screen.latest.pairs).toBe(4);
    expect(r.screen.latest.sizes.find((size) => size.pairs === 3)?.stars).toBe(3);
  });

  it('deals a different board each time the player sits down', () => {
    const faces = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = rig({ seed: seed * 977 });
      r.game.open();
      faces.add(r.screen.latest.cards.map((card) => card.word).join(','));
    }
    expect(faces.size).toBe(30);
  });

  it('does not come up when the screen cannot be drawn, and lets the world go again', () => {
    const r = rig();
    r.screen.breaks = true;
    expect(r.game.open()).toBe('broke');
    expect(r.game.busy).toBe(false);
    expect(r.log).toEqual(['freeze', 'close', 'thaw']);
    expect(r.reports).toHaveLength(1);
  });
});

describe('turning cards', () => {
  it('turns a card up with a sound and says its word', () => {
    const r = rig();
    r.game.open();
    r.said.length = 0;
    r.screen.handlers.turn(2);
    expect(states(r)[2]).toBe('up');
    expect(r.sounds.at(-1)).toBe('flip');
    expect(r.said).toEqual([[`word.${r.screen.latest.cards[2]!.word}`]]);
  });

  it('keeps a pair that is the same up in gold, with the climb of a run, a cheer after the word, and no word said of it being wrong', () => {
    const r = rig();
    r.game.open();
    r.said.length = 0;
    const pairs = pairsOn(r);
    const [a, b] = pairs[0]!;
    const [c, d] = pairs[1]!;
    r.screen.handlers.turn(a!);
    r.screen.handlers.turn(b!);
    expect(states(r)[a!]).toBe('paired');
    expect(states(r)[b!]).toBe('paired');
    expect(r.screen.latest.found).toBe(1);
    expect(r.sounds.slice(-2)).toEqual(['flip', 'pair:1']);
    const lastSaid = r.said.at(-1)!;
    expect(lastSaid[0]).toBe(`word.${r.screen.latest.cards[a!]!.word}`);
    expect(lastSaid[1]).toMatch(/^cheer\./);
    r.screen.handlers.turn(c!);
    r.screen.handlers.turn(d!);
    expect(r.sounds.at(-1), 'a second pair in a row is a step higher').toBe('pair:2');
    for (const clips of r.said)
      for (const clip of clips) expect(CLIP_IDS.has(clip), `${clip} is a clip the voice has`).toBe(true);
  });

  it('shows two cards that are not the same for long enough to look, with a soft nudge, and then turns them back down', () => {
    const r = rig();
    r.game.open();
    const [x, y] = notAPair(r);
    r.screen.handlers.turn(x);
    r.screen.handlers.turn(y);
    expect(states(r)[x]).toBe('up');
    expect(states(r)[y]).toBe('up');
    expect(r.sounds.at(-1)).toBe('nudge');
    r.clock.advance(MISS_STAYS_MS - 1);
    expect(states(r)[x]).toBe('up');
    r.clock.advance(1);
    expect(states(r)[x]).toBe('down');
    expect(states(r)[y]).toBe('down');
    expect(r.screen.latest.found).toBe(0);
  });

  it('turns the two that were not the same down at once when the player touches a third, which begins a new pair, and the old timer does not turn it back', () => {
    const r = rig();
    r.game.open();
    const [x, y] = notAPair(r);
    const third = [0, 1, 2, 3, 4, 5].find((place) => place !== x && place !== y)!;
    r.screen.handlers.turn(x);
    r.screen.handlers.turn(y);
    r.clock.advance(MISS_STAYS_MS / 2);
    r.screen.handlers.turn(third);
    expect(states(r)[x]).toBe('down');
    expect(states(r)[y]).toBe('down');
    expect(states(r)[third]).toBe('up');
    r.clock.advance(MISS_STAYS_MS);
    expect(states(r)[third], 'it waits for its pair').toBe('up');
  });

  it('does nothing for a card that is up already, a card that is paired, or a card that is not there', () => {
    const r = rig();
    r.game.open();
    const shown = r.screen.views.length;
    const [a, b] = pairsOn(r)[0]!;
    r.screen.handlers.turn(a!);
    r.screen.handlers.turn(a!);
    r.screen.handlers.turn(b!);
    r.screen.handlers.turn(a!);
    r.screen.handlers.turn(99);
    r.screen.handlers.turn(-1);
    expect(r.screen.views.length - shown, 'two turns drew two views').toBe(2);
  });
});

describe('winning', () => {
  it('says it is won a moment after the last pair, saves the game with its stars, and offers the next size', () => {
    const r = rig();
    r.game.open();
    winIt(r);
    const won = r.screen.latest.won!;
    expect(won).toEqual({ turns: 3, stars: 3, best: false, next: 4 });
    expect(r.record().memory).toEqual({ played: 1, sizes: { '3': { wins: 1, best: 3, stars: 3 } } });
    expect(r.sounds.at(-1)).toBe('finish:3');
    expect(r.said.at(-1)).toEqual([MEMORY_DONE_CLIP]);
    expect(r.screen.latest.caption).toBe('You found every pair in 3 turns.');
  });

  it('does not say it is won before the cheer has had its time', () => {
    const r = rig();
    r.game.open();
    winIt(r);
    const again = rig();
    again.game.open();
    for (const [x, y] of pairsOn(again)) {
      again.screen.handlers.turn(x!);
      again.screen.handlers.turn(y!);
    }
    again.clock.advance(WON_AFTER_MS - 1);
    expect(again.screen.latest.won).toBeNull();
    expect(again.record().memory.played).toBe(0);
    again.clock.advance(1);
    expect(again.screen.latest.won).not.toBeNull();
  });

  it('counts the turns that missed, and says nothing worse of them than the number', () => {
    const r = rig();
    r.game.open();
    winIt(r, 3);
    expect(r.screen.latest.won).toMatchObject({ turns: 6, stars: 3 });
    expect(r.screen.latest.caption).toBe('You found every pair in 6 turns.');
    expect(JSON.stringify(r.screen.views)).not.toMatch(/wrong|fail|bad|no\b/i);
  });

  it('says a best of this size only when it beats an earlier game, and never of the first', () => {
    const r = rig({ record: withGame(emptyPlay(), 3, 6) });
    r.game.open();
    r.screen.handlers.size(3);
    winIt(r);
    expect(r.screen.latest.won).toMatchObject({ turns: 3, best: true });
    const worse = rig({ record: withGame(emptyPlay(), 3, 3) });
    worse.game.open();
    worse.screen.handlers.size(3);
    winIt(worse, 2);
    expect(worse.screen.latest.won).toMatchObject({ turns: 5, best: false });
    expect(worse.record().memory.sizes['3']!.best, 'a worse game takes nothing away').toBe(3);
  });

  it('plays again at the same size on a new deal, or goes up a size, and the biggest has nothing bigger to offer', () => {
    const r = rig();
    r.game.open();
    const first = r.screen.latest.cards.map((c) => c.word).join(',');
    const deal1 = r.screen.latest.deal;
    winIt(r);
    r.screen.handlers.again();
    expect(r.screen.latest.pairs).toBe(3);
    expect(r.screen.latest.deal).toBeGreaterThan(deal1);
    expect(r.screen.latest.cards.map((c) => c.word).join(',')).not.toBe(first);
    expect(r.screen.latest.won).toBeNull();
    winIt(r);
    r.screen.handlers.more();
    expect(r.screen.latest.pairs).toBe(4);
    winIt(r);
    r.screen.handlers.more();
    expect(r.screen.latest.pairs).toBe(6);
    winIt(r);
    r.screen.handlers.more();
    expect(r.screen.latest.pairs).toBe(8);
    winIt(r);
    expect(r.screen.latest.won!.next).toBeNull();
    const deal = r.screen.latest.deal;
    r.screen.handlers.more();
    expect(r.screen.latest.deal, 'nothing happens').toBe(deal);
    expect(r.record().memory.played).toBe(5);
  });

  it('ignores Play again and More cards while a game is being played', () => {
    const r = rig();
    r.game.open();
    const deal = r.screen.latest.deal;
    r.screen.handlers.again();
    r.screen.handlers.more();
    expect(r.screen.latest.deal).toBe(deal);
  });
});

describe('choosing how many cards', () => {
  it('deals a new board of that size at any time, and ignores a size that is no size', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.size(8);
    expect(r.screen.latest.cards).toHaveLength(16);
    expect(r.screen.latest.sizes.filter((s) => s.chosen).map((s) => s.pairs)).toEqual([8]);
    const deal = r.screen.latest.deal;
    for (const bad of [0, 1, 5, 7, 9, -4, Number.NaN]) r.screen.handlers.size(bad);
    expect(r.screen.latest.deal).toBe(deal);
    r.screen.handlers.size(3);
    expect(r.screen.latest.cards).toHaveLength(6);
  });

  it('throws away the turn that was waiting, so a board dealt in the middle of a miss is not turned by it', () => {
    const r = rig();
    r.game.open();
    const [x, y] = notAPair(r);
    r.screen.handlers.turn(x);
    r.screen.handlers.turn(y);
    r.screen.handlers.size(4);
    const views = r.screen.views.length;
    r.clock.advance(MISS_STAYS_MS * 2);
    expect(r.screen.views.length).toBe(views);
    expect(states(r).every((s) => s === 'down')).toBe(true);
  });
});

describe('leaving', () => {
  it('takes the screen away, lets the world go, stops the voice, and leaves nothing waiting', () => {
    const r = rig();
    r.game.open();
    const [x, y] = notAPair(r);
    r.screen.handlers.turn(x);
    r.screen.handlers.turn(y);
    const stops = r.stops();
    r.screen.handlers.close();
    expect(r.game.busy).toBe(false);
    expect(r.screen.up).toBe(false);
    expect(r.log).toEqual(['freeze', 'close', 'thaw']);
    expect(r.stops()).toBeGreaterThan(stops);
    const views = r.screen.views.length;
    r.clock.advance(MISS_STAYS_MS * 3);
    expect(r.screen.views.length).toBe(views);
    expect(r.clock.waiting).toBe(0);
  });

  it('keeps what the player won when they leave in the middle of the cheer, and can sit down again to a fresh board', () => {
    const r = rig();
    r.game.open();
    for (const [x, y] of pairsOn(r)) {
      r.screen.handlers.turn(x!);
      r.screen.handlers.turn(y!);
    }
    r.screen.handlers.close();
    r.clock.advance(WON_AFTER_MS * 2);
    expect(r.record().memory.played, 'a game the player left before it said it was won is not counted').toBe(0);
    expect(r.game.open()).toBe('up');
    expect(states(r).every((s) => s === 'down')).toBe(true);
  });

  it('goes away when a parent turns learning off, and stays when something else changes', () => {
    const r = rig();
    r.game.open();
    r.setSettings({ say: false });
    r.game.settingsChanged();
    expect(r.game.busy).toBe(true);
    r.setSettings({ on: false });
    r.game.settingsChanged();
    expect(r.game.busy).toBe(false);
    expect(r.log.at(-1)).toBe('thaw');
  });

  it('leaves the voice and the sounds to fail without ever stopping the game', () => {
    const noisy = rig({ throwing: 'sound' });
    expect(noisy.game.open()).toBe('up');
    winIt(noisy);
    expect(noisy.screen.latest.won).not.toBeNull();
    expect(noisy.reports.length).toBeGreaterThan(0);
    const mute = rig({ throwing: 'voice' });
    expect(mute.game.open()).toBe('up');
    winIt(mute);
    expect(mute.screen.latest.won).not.toBeNull();
  });

  it('tells the screen whether there is a voice to hear', () => {
    const r = rig();
    r.game.open();
    expect(r.screen.latest.speech).toBe(true);
    r.setSettings({ say: false });
    r.screen.handlers.size(4);
    expect(r.screen.latest.speech).toBe(false);
    r.setSettings({ say: true });
    r.voice.audible = false;
    r.screen.handlers.size(3);
    expect(r.screen.latest.speech).toBe(false);
  });
});
