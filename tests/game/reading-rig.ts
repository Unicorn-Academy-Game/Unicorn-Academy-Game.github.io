import { expect } from 'vitest';
import { STAGES } from '../../src/content/reading';
import { CLEARED_EXTRA_MS, JOIN_AFTER_MS, READS_EXTRA_MS, Reader } from '../../src/game/reader';
import type { Cue, ItemView, ReadHandlers, ReadScreen, ReadView } from '../../src/game/reading-ports';
import { type ClipId, emptyProfile, type LearnerProfile, withProgress } from '../../src/learning';
import { ALL_CLIPS } from '../../src/learning/course-clips';
import { wordsOf } from '../../src/learning/reading';
import type { LearningSettings } from '../../src/shared/learning';
import { DAY, progress, seeded, settings, T0 } from '../learning/helpers';
import { Clock } from './clock';

export const CLIP_IDS: ReadonlySet<string> = new Set(ALL_CLIPS.map((clip) => clip.id));

/** A screen that remembers what it was shown, and is touched by the test as a child would be. */
class FakeScreen implements ReadScreen {
  handlers!: ReadHandlers;
  readonly views: ReadView[] = [];
  up = false;
  /** Which view shown breaks, counting from 1, or 0 for none. */
  breaksAt = 0;
  /** Or which views break, by what they are. */
  breakOn: ((view: ReadView) => boolean) | null = null;
  private shows = 0;

  constructor(private readonly log: string[]) {}

  show(view: ReadView): void {
    this.shows += 1;
    if (this.breaksAt === this.shows || this.breakOn?.(view)) throw new Error('the screen broke');
    this.up = true;
    this.views.push(view);
    if (view.screen === 'item' && view.phase === 'found') this.log.push('found');
  }

  close(): void {
    this.up = false;
    this.log.push('close');
  }

  get latest(): ReadView {
    return this.views[this.views.length - 1]!;
  }

  /** The thing on the screen, which the test says is a thing to read. */
  get item(): ItemView {
    const view = this.latest;
    if (view.screen !== 'item') throw new Error(`the screen is showing ${view.screen}, not a thing to read`);
    return view;
  }

  /** Every cue the screen was shown, in order. */
  get cues(): Cue[] {
    return this.views.flatMap((view) => (view.screen === 'item' && view.cue ? [view.cue] : []));
  }
}

type Said = { clips: readonly ClipId[]; began: ((clip: ClipId, seconds: number, delay: number) => void) | undefined };

export interface Rig {
  clock: Clock;
  screen: FakeScreen;
  reader: Reader;
  log: string[];
  /** What the voice was asked to say and said, which is less when nothing could be heard. */
  said: Said[];
  /** Every ask, heard or not. */
  asked: Said[];
  sounds: string[];
  reports: unknown[];
  book: () => LearnerProfile;
  /** Changes the book from outside the reader, as a parent does. */
  setBook: (next: LearnerProfile) => void;
  writes: () => number;
  setSettings: (patch: Partial<LearningSettings>) => void;
  voice: { audible: boolean };
  stops: () => number;
}

export function rig(
  options: {
    profile?: LearnerProfile;
    settings?: Partial<LearningSettings>;
    audible?: boolean;
    throwing?: 'sound' | 'voice';
    seed?: number;
  } = {},
): Rig {
  const clock = new Clock();
  const log: string[] = [];
  const screen = new FakeScreen(log);
  const said: Said[] = [];
  const asked: Said[] = [];
  const sounds: string[] = [];
  const reports: unknown[] = [];
  let book = options.profile ?? emptyProfile();
  let writes = 0;
  let stopped = 0;
  let current = settings(options.settings);
  const voice = { audible: options.audible ?? true };
  const note = (name: string): void => {
    if (options.throwing === 'sound') throw new Error('the sound broke');
    sounds.push(name);
  };
  const reader = new Reader({
    settings: () => current,
    book: {
      get: () => book,
      set: (next) => {
        book = next;
        writes += 1;
        log.push('book');
      },
    },
    now: () => clock.now,
    random: seeded(options.seed ?? 11),
    later: clock.later,
    makeScreen: (handlers) => {
      screen.handlers = handlers;
      return screen;
    },
    voice: {
      get audible() {
        return voice.audible;
      },
      // Like the real voice, it says nothing when it would not be heard.
      say: (clips, began) => {
        if (options.throwing === 'voice') throw new Error('the voice broke');
        asked.push({ clips, began });
        if (voice.audible) said.push({ clips, began });
      },
      stop: () => {
        stopped += 1;
      },
    },
    sounds: {
      open: () => note('open'),
      tile: (at, of) => note(`tile:${at}/${of}`),
      bounce: () => note('bounce'),
      join: () => note('join'),
      hint: () => note('hint'),
      found: (clean, reads) => note(`found:${reads ? 'reads' : clean ? 'clean' : 'help'}`),
      cleared: (chapter) => note(chapter ? 'cleared:chapter' : 'cleared'),
      round: (read) => note(`round:${read}`),
    },
    rest: { freeze: () => void log.push('freeze'), thaw: () => void log.push('thaw') },
    report: (error) => void reports.push(error),
  });
  return {
    clock,
    screen,
    reader,
    log,
    said,
    asked,
    sounds,
    reports,
    book: () => book,
    setBook: (next) => {
      book = next;
    },
    writes: () => writes,
    setSettings: (patch) => {
      current = { ...current, ...patch };
    },
    voice,
    stops: () => stopped,
  };
}

/** Sits down and starts a round. */
export function sitAndStart(r: Rig): void {
  expect(r.reader.open()).toBe('up');
  r.screen.handlers.start();
}

/** Touches every piece of the thing on the screen, in order. */
export function touchAll(r: Rig): void {
  const count = r.screen.item.pieces.length;
  for (let at = 0; at < count; at++) r.screen.handlers.touch(at);
}

/** Waits until the pieces have joined. */
export function settle(r: Rig): void {
  r.clock.advance(JOIN_AFTER_MS);
}

/** The player says it and taps the tick. */
export function yes(r: Rig): void {
  r.screen.handlers.approve();
}

/** Reads the thing on the screen cleanly, and waits until the next comes. */
export function readIt(r: Rig): void {
  touchAll(r);
  settle(r);
  yes(r);
  r.clock.advance(r.reader.stayMs + READS_EXTRA_MS + CLEARED_EXTRA_MS);
}

/**
 * Reads every word that comes first in the round, until a sentence is on the screen. A round that
 * does not go on fails and does not hang.
 */
export function readWords(r: Rig): void {
  for (let guard = 0; r.screen.item.kind === 'word'; guard++) {
    expect(guard, 'a round of seven has at most seven words').toBeLessThan(8);
    readIt(r);
  }
}

/** What the things on the screen are called, as the course writes them. */
export const wordOn = (r: Rig): string => r.screen.item.pieces.map((piece) => piece.text).join('');

export const spoken = (r: Rig): ClipId[] => r.said.flatMap((said) => said.clips);

/**
 * A book in which every word of the first stage has been read, and is due, so that a round has
 * sentences in it.
 */
export function booked(stages: number, patch = {}): LearnerProfile {
  let book = emptyProfile();
  for (const stage of STAGES.slice(0, stages)) {
    for (const word of [...stage.words, ...stage.tricky])
      book = withProgress(book, word.id, 'read', progress({ level: 1, best: 1, due: T0 - DAY, ...patch }));
  }
  return book;
}

/** A book in which the first `count` words of the first stage have been read, and are due. */
export function bookedWords(count: number, patch = {}): LearnerProfile {
  let book = emptyProfile();
  for (const word of wordsOf(STAGES[0]!).slice(0, count))
    book = withProgress(book, word.id, 'read', progress({ level: 1, best: 1, due: T0 - DAY, ...patch }));
  return book;
}
