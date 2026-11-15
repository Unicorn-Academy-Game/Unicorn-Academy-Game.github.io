import { RAIN_KINDS, type RainKind } from '../../../content/rain';
import type { Counts } from '../../../game/rain';
import { clamp, easeOutQuad } from '../../engine/ease';

/**
 * The count at the end of a round: what the player caught is counted out one kind after another,
 * gems, then gold, then money, each going up with a tick for every piece, and then the whole of it
 * is said. The timeline is plain numbers so a test can read it and the game can only play it.
 */

export interface Tally {
  readonly kind: RainKind;
  readonly n: number;
  /** When it begins and ends counting, in seconds from the start of the count. */
  readonly start: number;
  readonly end: number;
}

export interface Count {
  readonly tallies: readonly Tally[];
  /** When the whole is said. */
  readonly headlineAt: number;
  /** When the count is over. */
  readonly end: number;
}

/**
 * The seconds before the first count, for the chest to come to the middle and the dust to settle.
 */
export const LEAD = 1.1;
const GAP = 0.35;
/** A kind with nothing in it is passed in a moment. */
const EMPTY_SECONDS = 0.3;
const EMPTY_GAP = 0.1;
/** The most ticks in a second, so that a big count is a quick roll and not a buzz. */
const MOST_TICKS_PER_SECOND = 13;

/**
 * How long a kind takes to count: a moment for none, and a little longer for each piece, up to a
 * bound.
 */
export const secondsFor = (n: number): number => (n <= 0 ? EMPTY_SECONDS : clamp(0.5 + n * 0.04, 0.5, 1.8));

export function countUp(counts: Counts): Count {
  const tallies: Tally[] = [];
  let at = LEAD;
  for (const kind of RAIN_KINDS) {
    const n = counts[kind];
    const end = at + secondsFor(n);
    tallies.push({ kind, n, start: at, end });
    at = end + (n <= 0 ? EMPTY_GAP : GAP);
  }
  const headlineAt = at + 0.1;
  return { tallies, headlineAt, end: headlineAt + 1.7 };
}

/**
 * What a tally shows `now`: counted up with a little ease at the end, as a thing coming to rest. A
 * whole number.
 */
export function shownAt(t: Tally, now: number): number {
  if (now <= t.start) return 0;
  if (now >= t.end) return t.n;
  return Math.min(t.n, Math.floor(easeOutQuad((now - t.start) / (t.end - t.start)) * (t.n + 1)));
}

/**
 * The moments a tally ticks, one for each piece, or fewer for a count that would tick faster than
 * an ear can follow.
 */
export function ticksOf(t: Tally): number[] {
  const span = t.end - t.start;
  const most = Math.max(1, Math.floor(span * MOST_TICKS_PER_SECOND));
  const count = Math.min(t.n, most);
  const out: number[] = [];
  for (let i = 1; i <= count; i++) {
    // The moment the number reaches this share of the way to the total, which keeps the ticks with
    // the number.
    const share = i / count;
    out.push(t.start + span * (1 - Math.sqrt(1 - share)));
  }
  return out;
}
