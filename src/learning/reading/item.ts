import { type ReadRung, readRungAt } from '../levels';
import type { Attempt } from '../mastery';

/**
 * How many wrong touches in a row, without a right one between, it takes before the tile the player
 * needs begins to shine.
 */
export const HELP_AFTER = 3;

/**
 * What the player reads is a word, which they touch tile by tile, or a sentence, which they touch
 * word by word. Both are the same kind of thing to the rules: a row of touches in order, and then
 * the player says it and taps the tick.
 */
export type Kind = 'word' | 'line';

/**
 * Where the player is.
 *
 * - `touching`: the tiles of a word or the words of a sentence are there to be touched, in order.
 * - `saying`: the last one is touched, and they say it out loud. Only the tick, or asking twice for
 *   once more, leaves this phase.
 * - `done`: it was read, or they asked twice for once more and it was told to them.
 */
type Phase = 'touching' | 'saying' | 'done';

/** How it ended. A `told` item was said to the player, and counts as one they need help with. */
type Ending = 'read' | 'told';

/**
 * One word or one sentence being read. It is a plain value and every move returns a new one, so the
 * screen is a thin picture of it and the rules can be tested without one. The rule at the heart of
 * it is that the player can always go on: a touch out of order only bounces, and nothing they do
 * makes the next touch any harder.
 */
export interface Reading {
  readonly kind: Kind;
  /** How many touches it takes: the tiles of a word, or the words of a sentence. */
  readonly units: number;
  readonly level: number;
  readonly rung: ReadRung;
  readonly phase: Phase;
  /** How many are touched, which is also the place of the one the player needs next. */
  readonly next: number;
  readonly slips: number;
  readonly hints: number;
  /**
   * The wrong one touched last, while no right one has been touched since, so a hammered tile is
   * one slip.
   */
  readonly lastSlip: number | null;
  /** Wrong touches in a row on the one the player needs, since the last right touch. */
  readonly misses: number;
  /**
   * Whether the one the player needs shines because they asked or because they kept missing, and
   * not because of the level.
   */
  readonly helped: boolean;
  /**
   * Whether it has been said to the player, by the voice on its own at a level that does that, or
   * because they asked.
   */
  readonly heard: boolean;
  /** How many times the player asked for once more. */
  readonly asked: number;
  readonly ending: Ending | null;
}

export type Touched =
  /** The one the player needed, and it is not the last. */
  | 'right'
  /** The last one: the tiles join, and now the player says it out loud. */
  | 'last'
  /** One the player had touched already. It plays again and costs nothing. */
  | 'again'
  /**
   * One that is not next. It bounces, and costs a slip unless it is the same one as the last that
   * bounced.
   */
  | 'slip'
  /** Not a touch of anything there is to touch now. */
  | 'ignored';

/** Starts a word or a sentence at a level. A word that is new to the player has a level of 0. */
export function begin(kind: Kind, units: number, level: number): Reading {
  if (!Number.isInteger(units) || units < 1)
    throw new RangeError(`a thing to read has at least one tile or word, and not ${units}`);
  const rung = readRungAt(level);
  return {
    kind,
    units,
    level,
    rung,
    phase: 'touching',
    next: 0,
    slips: 0,
    hints: 0,
    lastSlip: null,
    misses: 0,
    helped: false,
    heard: false,
    asked: 0,
    ending: null,
  };
}

export const isDone = (r: Reading): boolean => r.phase === 'done';

/**
 * The one that shines now: always on a level that lights it, and on the others once the player has
 * been helped. Nothing shines when the touching is over.
 */
export const glowing = (r: Reading): number | null =>
  r.phase === 'touching' && (r.rung.lights || r.helped) ? r.next : null;

export function touch(r: Reading, at: number): { reading: Reading; result: Touched } {
  if (r.phase !== 'touching' || !Number.isInteger(at) || at < 0 || at >= r.units)
    return { reading: r, result: 'ignored' };
  if (at < r.next) return { reading: r, result: 'again' };
  if (at === r.next) {
    const next = r.next + 1;
    const last = next >= r.units;
    // A word says itself at the level that does so as soon as its tiles are joined. A sentence
    // never does, since the voice would read it for the player.
    const reading: Reading = {
      ...r,
      next,
      misses: 0,
      helped: false,
      lastSlip: null,
      phase: last ? 'saying' : 'touching',
      heard: r.heard || (last && r.kind === 'word' && r.rung.says),
    };
    return { reading, result: last ? 'last' : 'right' };
  }
  const misses = r.misses + 1;
  const lit = !r.helped && !r.rung.lights && misses >= HELP_AFTER;
  return {
    reading: {
      ...r,
      slips: r.slips + (at === r.lastSlip ? 0 : 1),
      misses,
      lastSlip: at,
      helped: r.helped || lit,
      hints: r.hints + (lit ? 1 : 0),
    },
    result: 'slip',
  };
}

/**
 * The player asked for help with the one they need: it shines, and the read counts as helped.
 * Asking twice for one tile counts once.
 */
export function help(r: Reading): Reading {
  if (r.phase !== 'touching' || r.rung.lights || r.helped) return r;
  return { ...r, helped: true, hints: r.hints + 1 };
}

/**
 * The player asked to hear it. A word that the voice already said when its tiles joined gives them
 * nothing they did not have, so it costs nothing. Any other is said to them, and that is help.
 */
export function hear(r: Reading): Reading {
  if (r.phase !== 'saying' || r.heard) return r;
  return { ...r, heard: true, hints: r.hints + 1 };
}

/**
 * The player asked to be shown how a word sounds out, which is always help. A sentence has nothing
 * to show but to read it to them, which is `hear`.
 */
export function show(r: Reading): Reading {
  if (r.phase !== 'saying' || r.kind !== 'word') return r;
  return { ...r, heard: true, hints: r.hints + 1 };
}

/** The player said it and tapped the tick: they read it. */
export function approve(r: Reading): Reading {
  return r.phase === 'saying' ? { ...r, phase: 'done', ending: 'read' } : r;
}

/**
 * The player asked for once more. The first time it is shown to them and they say it again. The
 * second time it is told to them and the item ends, so that they are never held on one word. Both
 * count as help.
 */
export function askAgain(r: Reading): Reading {
  if (r.phase !== 'saying') return r;
  const asked = r.asked + 1;
  const told = asked >= 2;
  return {
    ...r,
    asked,
    heard: true,
    hints: r.hints + 1,
    phase: told ? 'done' : 'saying',
    ending: told ? 'told' : null,
  };
}

/** The two numbers that say what this read was. */
export const attemptOf = (r: Reading): Attempt => ({ slips: r.slips, hints: r.hints });
